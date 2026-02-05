
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MonthlyData, WorkRecord, LeaveType } from './types';
import { HOLIDAYS, LEAVE_HOURS, LEAVE_LABELS } from './constants';
import { calculateMonthlyStats, formatSeconds, isWorkingDay, toLocalISOString } from './utils/timeUtils';
// Firebase SDK import (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyB8Ymz20p_I1KUbLuzDxJWYx7Jrz4j_Uek",
  authDomain: "working-calc.firebaseapp.com",
  projectId: "working-calc",
  storageBucket: "working-calc.firebasestorage.app",
  messagingSenderId: "588962080570",
  appId: "1:588962080570:web:8c4a17632db8eff3365203",
  databaseURL: "https://working-calc-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Firebase 초기화
let db: any = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.error("Firebase initialization failed", e);
}

// --- Static Components ---

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
    <div 
      onMouseDown={onMouseDown}
      className={`flex flex-col items-center justify-between p-2 w-full bg-white rounded-2xl border-2 transition-all select-none cursor-grab active:cursor-grabbing
        ${isDragging ? 'border-blue-500 bg-blue-50 shadow-inner scale-[1.02]' : 'border-gray-50 hover:border-blue-100 hover:bg-gray-50'}`}
    >
      <button 
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => handleAdjust(e, 1)}
        className={`w-full flex justify-center py-2 rounded-xl transition-all ${isDragging ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:scale-90'}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 15l7-7 7 7" /></svg>
      </button>

      <div className="flex flex-col items-center my-1 pointer-events-none">
        <span className={`text-2xl font-mono font-bold leading-none ${isDragging ? 'text-blue-600' : 'text-gray-800'}`}>
          {val || '00'}
        </span>
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mt-1">{unit}</span>
      </div>

      <button 
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => handleAdjust(e, -1)}
        className={`w-full flex justify-center py-2 rounded-xl transition-all ${isDragging ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:scale-90'}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M19 9l-7 7-7-7" /></svg>
      </button>
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
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowScrollPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updatePart = useCallback((index: number, val: string, max: number, shouldPad = true) => {
    const newParts = [...parts];
    if (val === '') {
      newParts[index] = '';
    } else {
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

  const handleBlur = (index: number, val: string, max: number) => {
    if (val !== '') updatePart(index, val, max, true);
  };

  const clearAll = () => onChange('');

  return (
    <div className="flex flex-col gap-2.5 relative" ref={containerRef}>
      <div className="flex justify-between items-end px-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</label>
        <div className="flex gap-1.5">
          {value && (
            <button onClick={clearAll} className="text-[10px] text-red-500 hover:text-red-700 font-black bg-red-50 px-2 py-1 rounded-lg transition-all active:scale-95">지우기</button>
          )}
          <button onClick={onCurrentTime} className="text-[10px] text-blue-600 hover:text-blue-800 font-black bg-blue-50 px-2.5 py-1 rounded-lg transition-all active:scale-95 flex items-center gap-1">현재</button>
        </div>
      </div>
      <div className={`flex items-center justify-between p-1.5 pl-4 pr-1.5 rounded-2xl border-2 transition-all ${!value ? 'bg-gray-50 border-gray-100' : 'bg-white border-blue-100 shadow-sm'}`}>
        <div className="flex items-center gap-1 shrink-0">
          <SegmentInput val={h} index={0} max={23} inputRef={hRef} onInputChange={handleInputChange} onInputBlur={handleBlur} />
          <span className={`text-lg font-bold leading-none mb-1 ${!value ? 'text-gray-200' : 'text-gray-300'}`}>:</span>
          <SegmentInput val={m} index={1} max={59} inputRef={mRef} onInputChange={handleInputChange} onInputBlur={handleBlur} />
          <span className={`text-lg font-bold leading-none mb-1 ${!value ? 'text-gray-200' : 'text-gray-300'}`}>:</span>
          <SegmentInput val={s} index={2} max={59} inputRef={sRef} onInputChange={handleInputChange} onInputBlur={handleBlur} />
        </div>
        <button onClick={() => setShowScrollPicker(!showScrollPicker)} className={`p-2 rounded-xl transition-all border-2 ml-3 ${showScrollPicker ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-blue-500 border-gray-50 hover:border-blue-200 hover:bg-blue-50'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
      </div>
      {showScrollPicker && (
        <div className="absolute top-full left-0 right-0 mt-3 p-5 bg-white rounded-3xl border border-gray-100 shadow-2xl z-30 animate-in fade-in slide-in-from-top-4 duration-300 ring-1 ring-black/5">
          <div className="grid grid-cols-3 gap-2.5">
            <DragSegment val={h} index={0} max={23} unit="hour" onUpdatePart={updatePart} />
            <DragSegment val={m} index={1} max={59} unit="min" onUpdatePart={updatePart} />
            <DragSegment val={s} index={2} max={59} unit="sec" onUpdatePart={updatePart} />
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-gray-500 font-bold bg-blue-50/30 py-2.5 rounded-2xl border border-blue-50/50">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>
            숫자를 상하로 드래그하거나 버튼을 클릭하세요
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalData, setModalData] = useState<WorkRecord>({ checkIn: '', checkOut: '', leaveTypes: ['none'] });
  const [showModal, setShowModal] = useState(false);
  const [alertModal, setAlertModal] = useState<{ show: boolean, message: string }>({ show: false, message: '' });
  const [isSyncing, setIsSyncing] = useState(false);
  
  // 인증 및 유저 코드 상태
  const [userSecretCode, setUserSecretCode] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'save' | 'load' | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileName = `${currentYear}-${String(currentMonth).padStart(2, '0')}.txt`;

  const getLocalStorageKey = (year: number, month: number) => `work-data-${year}-${String(month).padStart(2, '0')}`;

  const loadLocalData = useCallback(() => {
    const saved = localStorage.getItem(getLocalStorageKey(currentYear, currentMonth));
    if (saved) setMonthlyData(JSON.parse(saved));
    else setMonthlyData({});
  }, [currentYear, currentMonth]);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  useEffect(() => {
    localStorage.setItem(getLocalStorageKey(currentYear, currentMonth), JSON.stringify(monthlyData));
  }, [monthlyData, currentYear, currentMonth]);

  const showAlert = (message: string) => setAlertModal({ show: true, message });

  // 코드 검증 및 액션 실행 트리거
  const requestCloudAction = (action: 'save' | 'load') => {
    if (userSecretCode === 'jsji') {
      if (action === 'save') executeCloudSave();
      else executeCloudLoad();
    } else {
      setPendingAction(action);
      setAuthInput('');
      setShowAuthModal(true);
    }
  };

  const handleAuthSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authInput === 'jsji') {
      setUserSecretCode('jsji');
      setShowAuthModal(false);
      // 지연 실행하여 모달 닫힘과 동시 처리 방지
      setTimeout(() => {
        if (pendingAction === 'save') executeCloudSave();
        else if (pendingAction === 'load') executeCloudLoad();
        setPendingAction(null);
      }, 100);
    } else {
      showAlert("코드가 올바르지 않습니다.");
    }
  };

  // --- Realtime Database Sync Execution ---
  const executeCloudSave = async () => {
    if (!db) {
      showAlert("Firebase 초기화 중입니다.");
      return;
    }

    setIsSyncing(true);
    try {
      const docId = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const userId = 'jsji'; 
      const dbPath = `users/${userId}/attendance/${docId}`;
      const dbRef = ref(db, dbPath);
      await set(dbRef, {
        records: monthlyData,
        updatedAt: Date.now(),
        year: currentYear,
        month: currentMonth
      });
      showAlert("클라우드 백업이 완료되었습니다.");
    } catch (e: any) {
      console.error(e);
      showAlert("백업 실패: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const executeCloudLoad = async () => {
    if (!db) {
      showAlert("Firebase 초기화 중입니다.");
      return;
    }

    setIsSyncing(true);
    try {
      const docId = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const userId = 'jsji'; 
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, `users/${userId}/attendance/${docId}`));
      if (snapshot.exists()) {
        const cloudData = snapshot.val().records;
        setMonthlyData(cloudData);
        showAlert("클라우드 데이터를 성공적으로 불러왔습니다.");
      } else {
        showAlert("해당 월의 클라우드 저장 데이터가 없습니다.");
      }
    } catch (e: any) {
      console.error(e);
      showAlert("불러오기 실패: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const datePattern = /^(\d{4})-(\d{2})\.txt$/;
    const match = file.name.match(datePattern);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (match) {
          const year = parseInt(match[1]);
          const month = parseInt(match[2]);
          localStorage.setItem(getLocalStorageKey(year, month), JSON.stringify(parsed));
          if (year === currentYear && month === currentMonth) setMonthlyData(parsed);
          else {
            setCurrentYear(year);
            setCurrentMonth(month);
          }
          showAlert(`${file.name} 데이터를 불러와 ${year}년 ${month}월로 이동했습니다.`);
        } else {
          setMonthlyData(parsed);
          showAlert(`${file.name} 데이터를 현재 화면에 불러왔습니다.`);
        }
      } catch (err) { showAlert('올바르지 않은 데이터 형식입니다.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportFile = () => {
    if (Object.keys(monthlyData).length === 0) {
      showAlert('내보낼 데이터가 없습니다.');
      return;
    }
    const blob = new Blob([JSON.stringify(monthlyData, null, 2)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => calculateMonthlyStats(currentYear, currentMonth, monthlyData), [currentYear, currentMonth, monthlyData]);

  const openEditModal = (dateStr: string) => {
    const rawExisting = monthlyData[dateStr];
    const existing: WorkRecord = rawExisting ? JSON.parse(JSON.stringify(rawExisting)) : { checkIn: '', checkOut: '', leaveTypes: ['none'] };
    if (!existing.leaveTypes && (existing as any).leaveType) existing.leaveTypes = [(existing as any).leaveType];
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
        finalData.checkIn = '';
        finalData.checkOut = '';
      } else {
        const normalize = (val: string) => {
          if (!val) return '';
          const p = val.split(':');
          return [(p[0] || '00').padStart(2, '0'), (p[1] || '00').padStart(2, '0'), (p[2] || '00').padStart(2, '0')].join(':');
        };
        finalData.checkIn = normalize(finalData.checkIn);
        finalData.checkOut = normalize(finalData.checkOut);
      }
      setMonthlyData({ ...monthlyData, [selectedDate]: finalData });
      setShowModal(false);
    }
  };

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else setCurrentMonth(prev => prev - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else setCurrentMonth(prev => prev + 1);
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

  const renderCalendar = () => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const todayStr = toLocalISOString(new Date());
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-24 md:h-32 bg-gray-50 border border-gray-100"></div>);
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(currentYear, currentMonth - 1, d);
      const dateStr = toLocalISOString(date);
      const isToday = dateStr === todayStr;
      const isWork = isWorkingDay(date);
      const record = monthlyData[dateStr];
      const holidayName = HOLIDAYS[dateStr];
      days.push(
        <div key={dateStr} onClick={() => openEditModal(dateStr)} className={`h-24 md:h-32 border p-2 cursor-pointer transition-all hover:shadow-md flex flex-col justify-between relative overflow-hidden ${isToday ? 'bg-blue-50/50 ring-2 ring-blue-400 ring-inset z-10' : 'bg-white border-gray-100'} ${!isWork ? 'bg-red-50/10' : ''}`}>
          {isToday && <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-blue-500 text-[9px] text-white font-bold rounded-bl-lg">TODAY</div>}
          <div className="flex justify-between items-start">
            <span className={`font-bold ${isToday ? 'text-blue-600' : 'text-gray-700'} ${holidayName || date.getDay() === 0 ? 'text-red-500' : date.getDay() === 6 ? 'text-blue-500' : ''}`}>{d}</span>
            {holidayName && <span className="text-[10px] text-red-400 font-medium truncate ml-1">{holidayName}</span>}
          </div>
          <div className="flex-1 flex flex-col justify-center gap-1">
            {record?.leaveTypes?.some(t => t !== 'none') && (
              <div className="flex flex-wrap gap-0.5">{record.leaveTypes.filter(t => t !== 'none').map(t => <span key={t} className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded font-bold">{LEAVE_LABELS[t]}</span>)}</div>
            )}
            {record && (record.checkIn || record.checkOut) && (
              <div className="text-[10px] text-gray-500 font-mono leading-tight bg-gray-50/50 p-1 rounded">
                {record.checkIn && <p className="truncate">IN: {record.checkIn}</p>}
                {record.checkOut ? <p className="truncate">OUT: {record.checkOut}</p> : (record.checkIn && <p className="text-orange-500 font-bold flex items-center gap-1">퇴근 전 <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse"></span></p>)}
              </div>
            )}
          </div>
        </div>
      );
    }
    return days;
  };

  return (
    <div className="min-h-screen pb-20 px-4 md:px-8 max-w-7xl mx-auto">
      <input type="file" ref={fileInputRef} onChange={handleImportFile} className="hidden" accept=".txt" />
      
      <header className="py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">근무시간 계산기</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-500 font-medium">한국 법정 근로시간 및 휴가 기준 • Cloud Sync 지원</p>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${userSecretCode === 'jsji' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
              {userSecretCode === 'jsji' ? 'Cloud Unlocked' : 'Cloud Access Locked'}
            </span>
          </div>
        </div>
        <div className="flex gap-2 invisible md:visible">
          {/* 헤더의 버튼 공간을 비워두거나 제거합니다. (액션 바로 이동) */}
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col"><span className="text-xs text-green-500 font-bold mb-1 uppercase tracking-wider">총 근무일수</span><span className="text-xl font-bold text-green-600">{stats.totalWorkingDays}일</span></div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col"><span className="text-xs text-orange-400 font-bold mb-1 uppercase tracking-wider">남은 근무일수</span><span className="text-xl font-bold text-orange-600">{stats.remainingWorkingDays}일</span></div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col"><span className="text-xs text-gray-400 font-bold mb-1 uppercase tracking-wider">필수 근무시간</span><span className="text-xl font-bold text-gray-800 font-mono">{Math.floor(stats.totalRequiredSeconds / 3600)}H</span></div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col ring-1 ring-blue-100"><span className="text-xs text-blue-400 font-bold mb-1 uppercase tracking-wider">근무한 시간</span><span className="text-xl font-bold text-blue-600 font-mono">{formatSeconds(stats.totalWorkedSeconds)}</span></div>
        <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm flex flex-col ring-2 ring-indigo-50/50"><span className="text-xs text-indigo-400 font-bold mb-1 uppercase tracking-wider">하루 평균 목표</span><span className="text-xl font-bold text-indigo-600 font-mono">{formatSeconds(stats.avgDailyRequiredSeconds)}</span></div>
      </section>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white rounded-lg border shadow-sm px-2">
            <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))} className="bg-transparent px-2 py-2 text-lg font-bold outline-none cursor-pointer">
              {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={currentMonth} onChange={(e) => setCurrentMonth(Number(e.target.value))} className="bg-transparent px-2 py-2 text-lg font-bold outline-none cursor-pointer">
              {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
          <div className="flex items-center bg-white rounded-lg border shadow-sm overflow-hidden">
            <button onClick={handlePrevMonth} className="px-4 py-2 hover:bg-gray-50 border-r text-gray-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
            <button onClick={handleNextMonth} className="px-4 py-2 hover:bg-gray-50 text-gray-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 클라우드 액션 버튼이 파일 버튼 위치로 이동됨 */}
          <button onClick={() => requestCloudAction('load')} disabled={isSyncing} className="px-6 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 transition-all flex items-center gap-2 border border-indigo-200 disabled:opacity-50">
            {isSyncing ? '...' : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>}
            불러오기
          </button>
          <button onClick={() => requestCloudAction('save')} disabled={isSyncing} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50">
            {isSyncing ? '...' : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
            백업하기
          </button>

          {/* 기존 파일 버튼은 기능만 유지하고 숨김 처리 */}
          <button onClick={() => fileInputRef.current?.click()} className="hidden">파일 불러오기</button>
          <button onClick={handleExportFile} className="hidden">파일 내보내기</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, idx) => (
            <div key={d} className={`py-3 text-center text-xs font-bold ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">{renderCalendar()}</div>
      </div>

      {/* 알림 모달 */}
      {alertModal.show && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-sm shadow-2xl p-6 text-center">
            <p className="text-gray-800 font-bold mb-6 whitespace-pre-line leading-relaxed">{alertModal.message}</p>
            <button onClick={() => setAlertModal({ show: false, message: '' })} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all">확인</button>
          </div>
        </div>
      )}

      {/* 유저 고유 코드 입력 모달 */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800">보안 코드 입력</h3>
              <p className="text-sm text-gray-500">클라우드 {pendingAction === 'save' ? '백업' : '불러오기'}를 위해 코드가 필요합니다.</p>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <input 
                autoFocus
                type="password"
                placeholder="유저고유코드를 입력하세요"
                value={authInput}
                onChange={(e) => setAuthInput(e.target.value)}
                className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-center text-lg font-bold tracking-widest focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder:text-gray-300 placeholder:tracking-normal placeholder:font-medium"
              />
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="flex-1 py-4 bg-white border-2 border-gray-100 text-gray-500 rounded-2xl font-bold hover:bg-gray-50 transition-all"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                >
                  확인
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 업무 기록 수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b flex justify-between items-center bg-white">
              <h2 className="text-2xl font-bold text-gray-800 tracking-tight">{selectedDate} 기록</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-all p-1.5 hover:bg-gray-50 rounded-full"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-8 space-y-10">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">휴가 설정</label>
                <div className="flex flex-wrap gap-2">
                  {['none', '8H', '6H', '4H', '2H', 'halfday'].map((type) => (
                    <button key={type} onClick={() => toggleLeave(type as LeaveType)} className={`px-5 py-2.5 text-sm font-bold rounded-xl border-2 transition-all ${modalData.leaveTypes?.includes(type as LeaveType) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}>{LEAVE_LABELS[type as LeaveType]}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                <ScrollTimePicker label="출근 시간" value={modalData.checkIn} onChange={(val) => setModalData(p => ({ ...p, checkIn: val }))} onCurrentTime={() => setCurrentTime('checkIn')} />
                <ScrollTimePicker label="퇴근 시간" value={modalData.checkOut} onChange={(val) => setModalData(p => ({ ...p, checkOut: val }))} onCurrentTime={() => setCurrentTime('checkOut')} />
              </div>
            </div>
            <div className="p-8 pt-4 flex gap-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 bg-white border-2 border-gray-100 text-gray-500 rounded-2xl font-bold">취소</button>
              <button onClick={handleSaveDay} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 transition-transform active:scale-95">반영하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
