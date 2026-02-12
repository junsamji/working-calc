
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MonthlyData, WorkRecord, LeaveType, MonthlySummary, HolidayMap } from './types.ts';
import { HOLIDAYS as DEFAULT_HOLIDAYS, LEAVE_HOURS, LEAVE_LABELS } from './constants.ts';
import { calculateDailyWorkSeconds, calculateMonthlyStats, formatSeconds, isWorkingDay, toLocalISOString } from './utils/timeUtils.ts';
// Firebase SDK import (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: process.env.DB_API_KEY,
  authDomain: "working-calc.firebaseapp.com",
  projectId: "working-calc",
  storageBucket: "working-calc.firebasestorage.app",
  messagingSenderId: "588962080570",
  appId: "1:588962080570:web:8c4a17632db8eff3365203",
  databaseURL: "https://working-calc-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

let db: any = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.error("Firebase initialization failed", e);
}

// --- Helper Functions ---
const formatConcise = (timeStr: string | undefined): string => {
  if (!timeStr || timeStr === '00:00:00') return '';
  const [h, m] = timeStr.split(':').map(Number);
  return `${h}h${m}m`;
};

// --- Shared Components ---

interface SegmentInputProps {
  val: string;
  index: number;
  max: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>, index: number, max: number) => void;
  onInputBlur: (index: number, val: string, max: number) => void;
}

const SegmentInput: React.FC<SegmentInputProps> = ({ val, index, max, inputRef, onInputChange, onInputBlur }) => (
  <input
    ref={inputRef}
    type="text"
    placeholder="--"
    value={val}
    onChange={(e) => onInputChange(e, index, max)}
    onBlur={(e) => onInputBlur(index, e.target.value, max)}
    className={`w-10 md:w-11 py-2 text-xl font-mono font-bold text-center bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all ${val === '' ? 'text-gray-300' : 'text-gray-800'}`}
    maxLength={2}
  />
);

interface DragSegmentProps {
  val: string;
  index: number;
  max: number;
  unit: string;
  onUpdatePart: (index: number, val: string, max: number, shouldPad: boolean) => void;
}

const DragSegment: React.FC<DragSegmentProps> = ({ val, index, max, unit, onUpdatePart }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    startY.current = e.clientY;
    startVal.current = parseInt(val) || 0;
    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    const deltaY = startY.current - e.clientY;
    const step = Math.floor(deltaY / 12); 
    let newVal = (startVal.current + step) % (max + 1);
    if (newVal < 0) newVal = (max + 1) + newVal;
    onUpdatePart(index, String(newVal), max, true);
  };

  const onMouseUp = () => {
    setIsDragging(false);
    document.body.style.cursor = 'default';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  const handleAdjust = (e: React.MouseEvent, amount: number) => {
    e.stopPropagation();
    let current = parseInt(val) || 0;
    let newVal = (current + amount) % (max + 1);
    if (newVal < 0) newVal = (max + 1) + newVal;
    onUpdatePart(index, String(newVal), max, true);
  };

  return (
    <div onMouseDown={onMouseDown} className={`flex flex-col items-center justify-between p-1.5 md:p-1 w-full bg-white rounded-2xl border-2 transition-all select-none cursor-grab active:cursor-grabbing ${isDragging ? 'border-blue-500 bg-blue-50 shadow-inner scale-[1.02]' : 'border-gray-50 hover:border-blue-100 hover:bg-gray-50'}`}>
      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => handleAdjust(e, 1)} className={`w-full flex justify-center py-1.5 md:py-0.5 rounded-xl transition-all ${isDragging ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:scale-90'}`}><svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 15l7-7 7 7" /></svg></button>
      <div className="flex flex-col items-center my-0.5 pointer-events-none">
        <span className={`text-xl md:text-lg font-mono font-bold leading-none ${isDragging ? 'text-blue-600' : 'text-gray-800'}`}>{val || '00'}</span>
        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mt-0.5">{unit}</span>
      </div>
      <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => handleAdjust(e, -1)} className={`w-full flex justify-center py-1.5 md:py-0.5 rounded-xl transition-all ${isDragging ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:scale-90'}`}><svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M19 9l-7 7-7-7" /></svg></button>
    </div>
  );
};

// --- TimePicker Component ---

interface ScrollTimePickerProps {
  value: string;
  onChange: (val: string) => void;
  label: string;
  onCurrentTime: () => void;
}

const ScrollTimePicker: React.FC<ScrollTimePickerProps> = ({ value, onChange, label, onCurrentTime }) => {
  const [showScrollPicker, setShowScrollPicker] = useState(false);
  const parts = useMemo(() => {
    if (!value) return ['', '', ''];
    const p = value.split(':');
    return [p[0] || '', p[1] || '', p[2] || ''];
  }, [value]);

  const h = parts[0];
  const m = parts[1];
  const s = parts[2];

  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const sRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setShowScrollPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updatePart = useCallback((index: number, val: string, max: number, shouldPad = true) => {
    const newParts = [...parts];
    if (val === '') newParts[index] = '';
    else {
      let num = parseInt(val);
      if (isNaN(num)) num = 0;
      if (num < 0) num = max;
      if (num > max) num = 0;
      newParts[index] = shouldPad ? String(num).padStart(2, '0') : val;
    }
    onChange(newParts.join(':'));
  }, [parts, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number, max: number) => {
    const rawVal = e.target.value.replace(/\D/g, '').slice(0, 2);
    const newParts = [...parts];
    newParts[index] = rawVal;
    onChange(newParts.join(':'));
    if (rawVal === '') return;
    const firstDigit = parseInt(rawVal[0]);
    let shouldMove = false;
    if (rawVal.length === 2) shouldMove = true;
    else if (rawVal.length === 1) {
      if (index === 0) { if (firstDigit >= 3) shouldMove = true; }
      else { if (firstDigit >= 6) shouldMove = true; }
    }
    if (shouldMove) {
      const paddedVal = String(parseInt(rawVal)).padStart(2, '0');
      const finalParts = [...newParts];
      finalParts[index] = paddedVal;
      onChange(finalParts.join(':'));
      if (index === 0) mRef.current?.focus();
      else if (index === 1) sRef.current?.focus();
    }
  };

  const handleBlur = (index: number, val: string, max: number) => { if (val !== '') updatePart(index, val, max, true); };

  const clearAll = () => onChange('');

  return (
    <div className="flex flex-col gap-2 relative" ref={containerRef}>
      <div className="flex justify-between items-end px-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</label>
        <div className="flex gap-1.5">
          {value && <button onClick={clearAll} className="text-[10px] text-red-500 hover:text-red-700 font-black bg-red-50 px-2 py-1 rounded-lg transition-all active:scale-95">지우기</button>}
          <button onClick={onCurrentTime} className="text-[10px] text-blue-600 hover:text-blue-800 font-black bg-blue-50 px-2.5 py-1 rounded-lg transition-all active:scale-95 flex items-center gap-1">현재</button>
        </div>
      </div>
      <div className={`flex items-center justify-between p-2 px-6 rounded-2xl border-2 transition-all ${!value ? 'bg-gray-50 border-gray-100' : 'bg-white border-blue-100 shadow-sm'} ${showScrollPicker ? 'ring-4 ring-blue-50 border-blue-400' : ''}`}>
        <div className="flex items-center gap-0.5 shrink-0">
          <SegmentInput val={h} index={0} max={23} inputRef={hRef} onInputChange={handleInputChange} onInputBlur={handleBlur} />
          <span className={`text-lg font-bold leading-none mb-1 mx-0.5 ${!value ? 'text-gray-200' : 'text-gray-300'}`}>:</span>
          <SegmentInput val={m} index={1} max={59} inputRef={mRef} onInputChange={handleInputChange} onInputBlur={handleBlur} />
          <span className={`text-lg font-bold leading-none mb-1 mx-0.5 ${!value ? 'text-gray-200' : 'text-gray-300'}`}>:</span>
          <SegmentInput val={s} index={2} max={59} inputRef={sRef} onInputChange={handleInputChange} onInputBlur={handleBlur} />
        </div>
        <button onClick={() => setShowScrollPicker(!showScrollPicker)} className={`p-2.5 rounded-xl transition-all border-2 ml-2 md:ml-4 ${showScrollPicker ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-blue-500 border-gray-50 hover:border-blue-200 hover:bg-blue-50'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
      </div>
      {showScrollPicker && (
        <div className="time-picker-popup animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="time-picker-content">
            <div className="grid grid-cols-3 gap-2.5">
              <DragSegment val={h} index={0} max={23} unit="hour" onUpdatePart={updatePart} />
              <DragSegment val={m} index={1} max={59} unit="min" onUpdatePart={updatePart} />
              <DragSegment val={s} index={2} max={59} unit="sec" onUpdatePart={updatePart} />
            </div>
            <div className="flex items-center justify-center gap-2 mt-3 text-[9px] text-gray-500 font-bold bg-blue-50/30 py-2 rounded-xl border border-blue-50/50">
              <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>
              상하 드래그 조작
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [monthlyData, setMonthlyData] = useState<MonthlyData>({});
  const [holidays, setHolidays] = useState<HolidayMap>(DEFAULT_HOLIDAYS);
  
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalData, setModalData] = useState<WorkRecord>({ checkIn: '', checkOut: '', leaveTypes: ['none'] });
  
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showHolidayNameInput, setShowHolidayNameInput] = useState<{show: boolean, date: string, name: string, isEdit: boolean}>({show: false, date: '', name: '', isEdit: false});

  const [alertModal, setAlertModal] = useState<{ show: boolean, message: string }>({ show: false, message: '' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentYear);
  const [pickerView, setPickerView] = useState<'month' | 'year'>('month');

  const [userSecretCode, setUserSecretCode] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'save' | 'load' | 'holiday' | null>(null);
  
  const [showInitialModal, setShowInitialModal] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getLocalStorageKey = (year: number, month: number) => `work-data-${year}-${String(month).padStart(2, '0')}`;

  const loadLocalData = useCallback(() => {
    const saved = localStorage.getItem(getLocalStorageKey(currentYear, currentMonth));
    if (saved) setMonthlyData(JSON.parse(saved));
    else setMonthlyData({});
  }, [currentYear, currentMonth]);

  useEffect(() => { loadLocalData(); }, [loadLocalData]);

  useEffect(() => {
    localStorage.setItem(getLocalStorageKey(currentYear, currentMonth), JSON.stringify(monthlyData));
  }, [monthlyData, currentYear, currentMonth]);

  const showAlert = (message: string) => setAlertModal({ show: true, message });

  const stats = useMemo(() => calculateMonthlyStats(currentYear, currentMonth, monthlyData, holidays), [currentYear, currentMonth, monthlyData, holidays]);

  const executeCloudSave = async () => {
    if (!db || userSecretCode !== process.env.AUTH_KEY) return;
    setIsSyncing(true);
    try {
      const docId = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const userId = process.env.AUTH_KEY; 
      const dbPath = `users/${userId}/attendance/${docId}`;
      const holidayPath = `users/${userId}/settings/holidays`;
      
      const summary: MonthlySummary = {
        totalWorkingDays: stats.totalWorkingDays,
        remainingWorkingDays: stats.remainingWorkingDays,
        requiredTime: formatSeconds(stats.totalRequiredSeconds),
        workedTime: formatSeconds(stats.totalWorkedSeconds),
        avgTargetTime: formatSeconds(stats.avgDailyRequiredSeconds),
        updatedAt: Date.now()
      };
      
      await set(ref(db, dbPath), { records: monthlyData, summary: summary, updatedAt: Date.now(), year: currentYear, month: currentMonth });
      await set(ref(db, holidayPath), holidays);
      showAlert("클라우드 저장이 완료되었습니다. (휴일 정보 포함)");
    } catch (e: any) { showAlert("저장 실패: " + e.message); } finally { setIsSyncing(false); }
  };

  const executeCloudLoad = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      const docId = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const userId = process.env.AUTH_KEY; 
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `users/${userId}/attendance/${docId}`));
      const holidaySnapshot = await get(child(dbRef, `users/${userId}/settings/holidays`));

      if (snapshot.exists()) setMonthlyData(snapshot.val().records || {});
      if (holidaySnapshot.exists()) setHolidays(holidaySnapshot.val());
      
      if (snapshot.exists() || holidaySnapshot.exists()) showAlert("클라우드 데이터를 성공적으로 불러왔습니다.");
      else showAlert("저장된 클라우드 데이터가 없습니다.");
    } catch (e: any) { showAlert("불러오기 실패: " + e.message); } finally { setIsSyncing(false); }
  };

  const handleAuthSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authInput === process.env.AUTH_KEY) {
      setUserSecretCode(process.env.AUTH_KEY);
      setShowAuthModal(false);
      setShowInitialModal(false);
      setTimeout(() => {
        if (pendingAction === 'save') executeCloudSave();
        else if (pendingAction === 'load' || pendingAction === null) executeCloudLoad();
        else if (pendingAction === 'holiday') setShowHolidayModal(true);
        setPendingAction(null);
      }, 100);
    } else { showAlert("코드가 올바르지 않습니다."); }
  };

  const requestAuth = (action: 'save' | 'load' | 'holiday') => {
    if (userSecretCode === process.env.AUTH_KEY) {
      if (action === 'save') executeCloudSave();
      else if (action === 'load') executeCloudLoad();
      else if (action === 'holiday') setShowHolidayModal(true);
    } else {
      setPendingAction(action);
      setAuthInput('');
      setShowAuthModal(true);
    }
  };

  const openEditModal = (dateStr: string) => {
    const rawExisting = monthlyData[dateStr];
    const existing: WorkRecord = rawExisting ? JSON.parse(JSON.stringify(rawExisting)) : { checkIn: '', checkOut: '', leaveTypes: ['none'] };
    if (!existing.leaveTypes || existing.leaveTypes.length === 0) existing.leaveTypes = ['none'];
    setSelectedDate(dateStr);
    setModalData(existing);
    setShowModal(true);
  };

  const handleSaveDay = () => {
    if (selectedDate) {
      let finalData = { ...modalData };
      const hasAnyLeave = finalData.leaveTypes && finalData.leaveTypes.some(t => t !== 'none');
      if (hasAnyLeave) {
        finalData.checkIn = ''; finalData.checkOut = '';
        const seconds = calculateDailyWorkSeconds('', '', finalData.leaveTypes);
        finalData.resultTime = formatSeconds(seconds);
      } else {
        const normalize = (val: string) => {
          if (!val) return '';
          const p = val.split(':');
          return [(p[0] || '00').padStart(2, '0'), (p[1] || '00').padStart(2, '0'), (p[2] || '00').padStart(2, '0')].join(':');
        };
        finalData.checkIn = normalize(finalData.checkIn);
        finalData.checkOut = normalize(finalData.checkOut);
        if (finalData.checkIn && finalData.checkOut) {
          const seconds = calculateDailyWorkSeconds(finalData.checkIn, finalData.checkOut, finalData.leaveTypes || ['none']);
          finalData.resultTime = formatSeconds(seconds);
        } else finalData.resultTime = '00:00:00';
      }
      setMonthlyData({ ...monthlyData, [selectedDate]: finalData });
      setShowModal(false);
    }
  };

  const handlePrevMonth = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(prev => prev - 1); }
    else setCurrentMonth(prev => prev - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(prev => prev + 1); }
    else setCurrentMonth(prev => prev + 1);
  };

  const toggleLeave = (type: LeaveType) => {
    setModalData(prev => {
      let newLeaves = [...(prev.leaveTypes || [])];
      if (type === 'none') return { ...prev, leaveTypes: ['none'] };
      newLeaves = newLeaves.filter(t => t !== 'none');
      if (newLeaves.includes(type)) {
        newLeaves = newLeaves.filter(t => t !== type);
        if (newLeaves.length === 0) newLeaves = ['none'];
      } else {
        const currentTotal = newLeaves.reduce((acc, t) => acc + LEAVE_HOURS[t], 0);
        if (currentTotal + LEAVE_HOURS[type] <= 8) newLeaves.push(type);
      }
      return { ...prev, leaveTypes: newLeaves };
    });
  };

  const setCurrentTime = (field: 'checkIn' | 'checkOut') => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setModalData(prev => ({ ...prev, [field]: timeStr }));
  };

  const handleToggleHoliday = (dateStr: string) => {
    if (holidays[dateStr]) {
      // 이미 휴일인 경우 정보 표시 팝업 (수정/삭제 모드)
      setShowHolidayNameInput({show: true, date: dateStr, name: holidays[dateStr], isEdit: true});
    } else {
      // 휴일이 아닌 경우 추가 팝업
      setShowHolidayNameInput({show: true, date: dateStr, name: '', isEdit: false});
    }
  };

  const confirmHolidayAdd = () => {
    if (!showHolidayNameInput.name.trim()) { showAlert("휴일 명칭을 입력해주세요."); return; }
    setHolidays({ ...holidays, [showHolidayNameInput.date]: showHolidayNameInput.name });
    setShowHolidayNameInput({show: false, date: '', name: '', isEdit: false});
  };

  const handleRemoveHoliday = () => {
    const newHolidays = { ...holidays };
    delete newHolidays[showHolidayNameInput.date];
    setHolidays(newHolidays);
    setShowHolidayNameInput({show: false, date: '', name: '', isEdit: false});
  };

  const renderCalendarDays = (year: number, month: number, isHolidayPicker: boolean) => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const lastDay = new Date(year, month, 0).getDate();
    const todayStr = toLocalISOString(new Date());
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-16 md:h-32 bg-gray-50 border border-gray-100"></div>);
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month - 1, d);
      const dateStr = toLocalISOString(date);
      const isToday = dateStr === todayStr;
      const isWork = isWorkingDay(date, holidays);
      const record = monthlyData[dateStr];
      const holidayName = holidays[dateStr];
      
      days.push(
        <div 
          key={dateStr} 
          onClick={() => isHolidayPicker ? handleToggleHoliday(dateStr) : openEditModal(dateStr)} 
          className={`h-16 md:h-32 border p-1 md:p-2 cursor-pointer transition-all hover:shadow-md flex flex-col items-center relative overflow-hidden ${isToday ? 'bg-blue-50/50 ring-2 ring-blue-400 ring-inset z-10' : 'bg-white border-gray-100'} ${!isWork ? 'bg-red-50/10' : ''}`}
        >
          {isToday && <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-blue-500 text-[9px] text-white font-bold rounded-bl-lg">TODAY</div>}
          
          <div className="w-full flex flex-col md:flex-row md:justify-between items-start md:items-center gap-0.5 md:gap-1">
            <span className={`font-bold md:text-xl lg:text-2xl leading-none ${isToday ? 'text-blue-600' : 'text-gray-700'} ${holidayName || date.getDay() === 0 ? 'text-red-500' : date.getDay() === 6 ? 'text-blue-500' : ''}`}>{d}</span>
            {holidayName && <span className="text-[8px] md:text-sm lg:text-base text-red-400 font-black truncate block leading-none">{holidayName}</span>}
          </div>

          {!isHolidayPicker && (
            <div className="flex-1 w-full flex flex-col justify-center items-center">
              {record?.leaveTypes?.some(t => t !== 'none') && (
                <div className="flex flex-wrap justify-center gap-0.5 mb-0.5">
                  {record.leaveTypes.filter(t => t !== 'none').map(t => (
                    <span key={t} className="text-[9px] md:text-xs lg:text-sm px-1 py-0.5 bg-green-100 text-green-700 rounded font-bold whitespace-nowrap">
                      {LEAVE_LABELS[t]}
                    </span>
                  ))}
                </div>
              )}
              {record && (record.checkIn || record.checkOut || (record.leaveTypes && record.leaveTypes.some(t => t !== 'none'))) && (
                <div className="w-full text-center">
                  {/* PC 전용 상세 정보 */}
                  <div className="hidden md:block w-full text-[10px] md:text-sm lg:text-base text-gray-500 font-mono leading-tight bg-gray-50/50 p-1 rounded">
                    {record.checkIn && <p className="truncate text-center">I: {record.checkIn}</p>}
                    {record.checkOut ? (
                      <p className="truncate text-center">O: {record.checkOut}</p>
                    ) : (
                      record.checkIn && (
                        <p className="text-orange-500 font-bold flex items-center justify-center gap-1 text-[10px] md:text-xs lg:text-sm">
                          퇴근 전 <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse"></span>
                        </p>
                      )
                    )}
                    {(record.resultTime && record.resultTime !== '00:00:00') && (
                      <p className="text-green-600 font-black border-t border-green-100 mt-1 pt-1 truncate text-center text-[12px] md:text-lg lg:text-xl">
                        {record.resultTime}
                      </p>
                    )}
                  </div>
                  {/* 모바일 전용 요약 정보 - 가독성 및 완벽한 중앙 정렬 */}
                  <div className="md:hidden w-full flex flex-col items-center justify-center">
                    {!record.checkOut && record.checkIn ? (
                       <p className="text-orange-500 font-normal text-[10px] text-center leading-none mt-1 whitespace-nowrap">퇴근 전</p>
                    ) : (
                       <p className="text-green-600 font-bold text-[11px] text-center leading-none mt-1 whitespace-nowrap">
                        {formatConcise(record.resultTime)}
                       </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return days;
  };

  const handleOpenPicker = () => {
    setPickerYear(currentYear);
    setPickerView('month');
    setShowMonthPicker(true);
  };

  const yearsForPicker = useMemo(() => {
    const range = [];
    const base = Math.floor(pickerYear / 10) * 10;
    for (let y = base - 5; y <= base + 15; y++) range.push(y);
    return range;
  }, [pickerYear]);

  const isLoggedIn = userSecretCode === process.env.AUTH_KEY;

  return (
    <div className="min-h-screen pb-20 px-4 md:px-8 max-w-7xl mx-auto">
      {/* Initial Entry Modal */}
      {showInitialModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl p-10 space-y-8 animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-blue-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-blue-200">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-4.514A9.01 9.01 0 0012 21a9.003 9.003 0 008.312-5.503m-3.44-4.514A9.01 9.01 0 0112 3c1.29 0 2.502.27 3.596.759M11 12a1 1 0 100-2 1 1 0 000 2zm-1 3a1 1 0 100-2 1 1 0 000 2zm2-2a1 1 0 100-2 1 1 0 000 2zm2 2a1 1 0 100-2 1 1 0 000 2z" /></svg>
              </div>
              <h2 className="text-3xl font-black text-gray-800 tracking-tight">근무시간 계산기</h2>
              <p className="text-gray-500 font-medium">데이터 동기화 방식을 선택해주세요.</p>
            </div>
            <div className="grid gap-4">
              <button onClick={() => { setShowAuthModal(true); setPendingAction(null); }} className="group relative py-5 bg-blue-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                Cloud Sync (로그인)
              </button>
              <button onClick={() => { setHolidays(DEFAULT_HOLIDAYS); setShowInitialModal(false); }} className="py-5 bg-white border-2 border-gray-100 text-gray-700 rounded-3xl font-black text-lg hover:bg-gray-50 transition-all flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Guest Mode (체험하기)
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">근무시간 계산기</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-500 font-medium">한국 법정 근로시간 및 휴가 기준 • Cloud Sync 지원</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${userSecretCode === process.env.AUTH_KEY ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>{userSecretCode === process.env.AUTH_KEY ? 'Cloud Unlocked' : 'Guest Mode'}</span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-6 lg:grid-cols-5 gap-2 lg:gap-4 mb-8">
        <div className="col-span-2 lg:col-span-1 bg-white p-3 lg:p-5 rounded-xl border shadow-sm flex flex-col"><span className="text-[10px] lg:text-xs text-green-500 font-bold mb-0.5 lg:mb-1 uppercase tracking-wider whitespace-nowrap">총 근무일수</span><span className="text-base lg:text-xl font-bold text-green-600">{stats.totalWorkingDays}일</span></div>
        <div className="col-span-2 lg:col-span-1 bg-white p-3 lg:p-5 rounded-xl border shadow-sm flex flex-col"><span className="text-[10px] lg:text-xs text-orange-400 font-bold mb-0.5 lg:mb-1 uppercase tracking-wider whitespace-nowrap">남은 근무일수</span><span className="text-base lg:text-xl font-bold text-orange-600">{stats.remainingWorkingDays}일</span></div>
        <div className="col-span-2 lg:col-span-1 bg-white p-3 lg:p-5 rounded-xl border shadow-sm flex flex-col"><span className="text-[10px] lg:text-xs text-gray-400 font-bold mb-0.5 lg:mb-1 uppercase tracking-wider whitespace-nowrap">필수 근무시간</span><span className="text-base lg:text-xl font-bold text-gray-800 font-mono">{formatSeconds(stats.totalRequiredSeconds)}</span></div>
        <div className="col-span-3 lg:col-span-1 bg-white p-3 lg:p-5 rounded-xl border shadow-sm flex flex-col ring-1 ring-blue-100"><span className="text-[10px] lg:text-xs text-blue-400 font-bold mb-0.5 lg:mb-1 uppercase tracking-wider whitespace-nowrap">근무한 시간</span><span className="text-base lg:text-xl font-bold text-blue-600 font-mono">{formatSeconds(stats.totalWorkedSeconds)}</span></div>
        <div className="col-span-3 lg:col-span-1 bg-white p-3 lg:p-5 rounded-xl border border-indigo-100 shadow-sm flex flex-col ring-2 ring-indigo-50/50"><span className="text-[10px] lg:text-xs text-indigo-400 font-bold mb-0.5 lg:mb-1 uppercase tracking-wider whitespace-nowrap">하루 평균 목표</span><span className="text-base lg:text-xl font-bold text-indigo-600 font-mono">{formatSeconds(stats.avgDailyRequiredSeconds)}</span></div>
      </section>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        {/* Left side: 년월 선택 */}
        <div className="flex items-center bg-white rounded-xl border shadow-sm px-1.5 h-12 overflow-hidden ring-1 ring-gray-100">
          <button onClick={handleOpenPicker} className="flex items-center gap-2 px-3 py-2 text-lg font-black text-gray-700 hover:bg-gray-50 transition-all rounded-md active:scale-95 whitespace-nowrap">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {currentYear}년 {currentMonth}월
          </button>
          <div className="w-[1.5px] h-6 bg-gray-100 mx-1"></div>
          <div className="flex items-center">
            <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-50 text-gray-400 hover:text-blue-500 transition-all active:scale-90"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg></button>
            <button onClick={handleNextMonth} className="p-2 hover:bg-gray-50 text-gray-400 hover:text-blue-500 transition-all active:scale-90"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>

        {/* Right side: 액션 버튼들 (로그인, 저장, 휴일관리) */}
        <div className="flex flex-wrap items-center gap-3">
          {!isLoggedIn && (
            <button onClick={() => requestAuth('load')} disabled={isSyncing} className="px-6 py-2.5 h-12 bg-indigo-50 text-indigo-700 rounded-xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center border border-indigo-100 disabled:opacity-50 whitespace-nowrap min-w-[100px]">
              {isSyncing ? '...' : '로그인'}
            </button>
          )}

          {isLoggedIn && (
            <button onClick={() => requestAuth('save')} disabled={isSyncing} className="px-6 py-2.5 h-12 bg-blue-50 text-blue-700 rounded-xl font-bold hover:bg-blue-100 transition-all flex items-center gap-2 border border-blue-100 disabled:opacity-50 whitespace-nowrap">
              {isSyncing ? '...' : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
              클라우드 저장
            </button>
          )}

          {isLoggedIn && (
            <button onClick={() => requestAuth('holiday')} className="px-5 py-3 h-12 bg-rose-50 text-rose-700 rounded-xl font-black text-sm border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-2 active:scale-95 whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              휴일 관리
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, idx) => (<div key={d} className={`py-3 text-center text-xs font-bold ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>))}
        </div>
        <div className="grid grid-cols-7">{renderCalendarDays(currentYear, currentMonth, false)}</div>
      </div>

      {/* Holiday Management Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="p-6 md:p-8 border-b flex justify-between items-center bg-gray-50/50 rounded-t-3xl">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight whitespace-nowrap">휴일 관리</h2>
                <p className="text-xs text-gray-400 font-bold uppercase mt-1 whitespace-nowrap">날짜를 선택하여 휴일을 토글하세요</p>
              </div>
              <button onClick={() => setShowHolidayModal(false)} className="text-gray-400 hover:text-gray-600 transition-all p-2 hover:bg-white rounded-full"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-center gap-4 bg-white p-3 rounded-2xl border ring-1 ring-gray-100">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-50 text-gray-400 hover:text-blue-500 transition-all active:scale-90"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
                <button onClick={handleOpenPicker} className="text-xl font-black text-gray-700 py-1 px-4 hover:bg-gray-50 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap">
                  {currentYear}년 {currentMonth}월
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <button onClick={handleNextMonth} className="p-2 hover:bg-gray-50 text-gray-400 hover:text-blue-500 transition-all active:scale-90"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg></button>
              </div>
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="grid grid-cols-7 bg-gray-50/50 border-b">
                  {['일', '월', '화', '수', '목', '금', '토'].map((d, idx) => (<div key={d} className={`py-2 text-center text-[10px] font-black ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>))}
                </div>
                <div className="grid grid-cols-7">{renderCalendarDays(currentYear, currentMonth, true)}</div>
              </div>
            </div>
            <div className="p-6 md:p-8 pt-4 border-t bg-gray-50/50 rounded-b-3xl">
              <button onClick={() => { requestAuth('save'); setShowHolidayModal(false); }} className="w-full py-4 bg-blue-50 text-blue-700 rounded-2xl font-black shadow-lg shadow-blue-100 hover:bg-blue-100 border border-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                설정 완료 및 클라우드 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Holiday Name/Manage Input Modal */}
      {showHolidayNameInput.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-gray-800 whitespace-nowrap">
                {showHolidayNameInput.isEdit ? '휴일 정보 확인' : '휴일 명칭 입력'}
              </h3>
              <p className="text-sm text-gray-400 font-bold">{showHolidayNameInput.date}</p>
            </div>
            <input 
              autoFocus 
              type="text" 
              placeholder="예: 창립기념일, 여름휴가 등" 
              value={showHolidayNameInput.name} 
              onChange={(e) => setShowHolidayNameInput(prev => ({...prev, name: e.target.value}))} 
              className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-center text-lg font-bold focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" 
            />
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex gap-3">
                <button onClick={() => setShowHolidayNameInput({show: false, date: '', name: '', isEdit: false})} className="flex-1 py-4 bg-white border-2 border-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-50 transition-all">취소</button>
                <button onClick={confirmHolidayAdd} className="flex-1 py-4 bg-blue-50 text-blue-700 border border-blue-100 rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-100 transition-all">
                  {showHolidayNameInput.isEdit ? '수정' : '확인'}
                </button>
              </div>
              {showHolidayNameInput.isEdit && (
                <button 
                  onClick={handleRemoveHoliday}
                  className="w-full py-4 bg-red-50 text-red-700 rounded-2xl font-bold border-2 border-red-100 hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  휴일 삭제
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></div>
              <h3 className="text-xl font-bold text-gray-800 whitespace-nowrap">보안 코드 인증</h3>
              <p className="text-sm text-gray-500">인증 후 클라우드 데이터를 동기화합니다.</p>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <input autoFocus type="password" placeholder="유저고유코드 입력" value={authInput} onChange={(e) => setAuthInput(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-center text-lg font-bold tracking-widest focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder:text-gray-300 placeholder:tracking-normal placeholder:font-medium" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAuthModal(false); if(showInitialModal) setShowInitialModal(true); }} className="flex-1 py-4 bg-white border-2 border-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-50 transition-all">취소</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">인증</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Existing Alert Modal */}
      {alertModal.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-sm shadow-2xl p-6 text-center">
            <p className="text-gray-800 font-bold mb-6 whitespace-pre-line leading-relaxed">{alertModal.message}</p>
            <button onClick={() => setAlertModal({ show: false, message: '' })} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all">확인</button>
          </div>
        </div>
      )}

      {/* Improved Month/Year Picker Modal */}
      {showMonthPicker && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[220] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50/30">
              <div className="flex items-center gap-3">
                <button onClick={() => setPickerYear(y => y - (pickerView === 'month' ? 1 : 12))} className="p-2.5 hover:bg-white rounded-xl text-gray-400 hover:text-blue-500 border border-transparent hover:border-blue-100 transition-all active:scale-90 shadow-sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
                <button 
                  onClick={() => setPickerView(pickerView === 'month' ? 'year' : 'month')}
                  className="px-4 py-2 hover:bg-white rounded-xl text-2xl font-black text-gray-800 tracking-tighter transition-all flex items-center gap-2 group border border-transparent hover:border-blue-50 whitespace-nowrap"
                >
                  {pickerView === 'month' ? `${pickerYear}년` : '년도 선택'}
                  <svg className={`w-5 h-5 text-blue-500 transition-transform duration-300 ${pickerView === 'year' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <button onClick={() => setPickerYear(y => y + (pickerView === 'month' ? 1 : 12))} className="p-2.5 hover:bg-white rounded-xl text-gray-400 hover:text-blue-500 border border-transparent hover:border-blue-100 transition-all active:scale-90 shadow-sm"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg></button>
              </div>
              <button onClick={() => setShowMonthPicker(false)} className="p-2 text-gray-300 hover:text-gray-500 transition-all hover:bg-white rounded-full"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="p-6 bg-gray-50/10 h-[380px] overflow-y-auto custom-scrollbar">
              {pickerView === 'month' ? (
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({length: 12}, (_, i) => i + 1).map((m) => (
                    <button 
                      key={m} 
                      onClick={() => { setCurrentYear(pickerYear); setCurrentMonth(m); setShowMonthPicker(false); }} 
                      className={`py-6 text-xl font-black rounded-2xl transition-all border-2 ${currentYear === pickerYear && currentMonth === m ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100 scale-105 z-10' : 'bg-white text-gray-600 border-white hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md'}`}
                    >
                      {m}월
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {yearsForPicker.map((y) => (
                    <button 
                      key={y} 
                      onClick={() => { setPickerYear(y); setPickerView('month'); }} 
                      className={`py-5 text-lg font-black rounded-2xl transition-all border-2 ${pickerYear === y ? 'bg-blue-600 text-white border-blue-600 shadow-xl' : 'bg-white text-gray-600 border-white hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md'}`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t bg-white flex justify-center">
              <button 
                onClick={() => { 
                  const now = new Date(); 
                  setCurrentYear(now.getFullYear()); 
                  setCurrentMonth(now.getMonth() + 1); 
                  setShowMonthPicker(false); 
                }} 
                className="px-6 py-2 bg-blue-50 text-blue-600 rounded-full font-black text-sm hover:bg-blue-100 transition-all active:scale-95"
              >
                오늘로 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl flex flex-col max-h-[95vh] md:min-h-[650px] animate-in fade-in zoom-in duration-200">
            <div className="p-6 md:p-8 border-b flex justify-between items-center bg-white rounded-t-3xl shrink-0">
              <h2 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight whitespace-nowrap">{selectedDate} 기록</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-all p-1.5 hover:bg-gray-50 rounded-full"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 md:space-y-12 custom-scrollbar md:overflow-y-visible">
              <div className="space-y-4 px-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block whitespace-nowrap">휴가 설정</label>
                <div className="flex flex-wrap gap-2">
                  {['none', '8H', '6H', '4H', '2H', 'halfday'].map((type) => (
                    <button key={type} onClick={() => toggleLeave(type as LeaveType)} className={`px-4 md:px-5 py-2 md:py-2.5 text-xs md:text-sm font-bold rounded-xl border-2 transition-all ${modalData.leaveTypes?.includes(type as LeaveType) ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'} whitespace-nowrap`}>{LEAVE_LABELS[type as LeaveType]}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-12 md:gap-y-20 md:gap-x-12">
                <ScrollTimePicker label="출근 시간" value={modalData.checkIn} onChange={(val) => setModalData(p => ({ ...p, checkIn: val }))} onCurrentTime={() => setCurrentTime('checkIn')} />
                <ScrollTimePicker label="퇴근 시간" value={modalData.checkOut} onChange={(val) => setModalData(p => ({ ...p, checkOut: val }))} onCurrentTime={() => setCurrentTime('checkOut')} />
              </div>
              {modalData.checkIn && modalData.checkOut && (
                <div className="p-4 bg-green-50 border-2 border-green-100 rounded-2xl flex justify-between items-center animate-in fade-in slide-in-from-bottom-2 shadow-sm">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span className="text-[10px] md:text-xs font-black text-green-700 uppercase tracking-widest whitespace-nowrap">근무시간 결과</span></div>
                  <span className="text-lg md:text-2xl font-mono font-bold text-green-600 tracking-tighter whitespace-nowrap">{formatSeconds(calculateDailyWorkSeconds(modalData.checkIn, modalData.checkOut, modalData.leaveTypes || ['none']))}</span>
                </div>
              )}
            </div>
            <div className="p-6 md:p-8 pt-4 flex gap-3 md:gap-4 shrink-0 border-t bg-gray-50/50 rounded-b-3xl z-[40]">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 md:py-4 bg-white border-2 border-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-50 transition-all whitespace-nowrap">닫기</button>
              <button onClick={handleSaveDay} className="flex-1 py-3 md:py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 transition-all active:scale-95 hover:bg-blue-700 whitespace-nowrap">반영하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;