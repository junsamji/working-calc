
import { MonthlyData, CalculationResult, LeaveType, WorkRecord } from '../types';
import { HOLIDAYS, LEAVE_HOURS } from '../constants';

/**
 * Date 객체를 로컬 시간 기준의 "YYYY-MM-DD" 문자열로 변환합니다.
 */
export const toLocalISOString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatSeconds = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const parseTimeString = (time: string): number => {
  if (!time) return 0;
  const parts = time.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
};

export const isWorkingDay = (date: Date): boolean => {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const dateStr = toLocalISOString(date);
  return !HOLIDAYS[dateStr];
};

export const calculateDailyWorkSeconds = (checkInStr: string, checkOutStr: string, leaveTypes: LeaveType[]): number => {
  // 휴가 시간 합산 (최대 8시간)
  let leaveTotalHours = 0;
  if (leaveTypes && leaveTypes.length > 0) {
    leaveTotalHours = leaveTypes.reduce((acc, type) => acc + (LEAVE_HOURS[type] || 0), 0);
  }
  let workSeconds = Math.min(8, leaveTotalHours) * 3600;

  // 출근과 퇴근 시간이 모두 있어야만 실제 근무 시간을 합산함 (퇴근 전이면 합산 제외)
  if (checkInStr && checkOutStr) {
    let checkIn = parseTimeString(checkInStr);
    let checkOut = parseTimeString(checkOutStr);

    if (checkIn > checkOut) {
      [checkIn, checkOut] = [checkOut, checkIn];
    }

    let duration = checkOut - checkIn;
    
    const lunchStart = 12 * 3600;
    const lunchEnd = 13 * 3600;

    const intersectionStart = Math.max(checkIn, lunchStart);
    const intersectionEnd = Math.min(checkOut, lunchEnd);

    if (intersectionEnd > intersectionStart) {
      duration -= (intersectionEnd - intersectionStart);
    }
    
    workSeconds += Math.max(0, duration);
  }

  return workSeconds;
};

export const calculateMonthlyStats = (year: number, month: number, data: MonthlyData): CalculationResult => {
  const lastDay = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayStr = toLocalISOString(today);

  let totalRequiredSeconds = 0;
  let totalWorkedSeconds = 0;
  let totalWorkingDays = 0;
  let remainingWorkingDays = 0;

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month - 1, d);
    const dateStr = toLocalISOString(date);
    const isWork = isWorkingDay(date);

    if (isWork) {
      totalWorkingDays++;
      totalRequiredSeconds += 8 * 3600;
      if (dateStr >= todayStr) {
        remainingWorkingDays++;
      }
    }

    const record = data[dateStr];
    if (record) {
      // 레거시 데이터 호환성 및 배열 구조 처리 수정
      let leaves: LeaveType[] = [];
      if (record.leaveTypes && Array.isArray(record.leaveTypes)) {
        leaves = record.leaveTypes;
      } else if ((record as any).leaveType) {
        leaves = [(record as any).leaveType];
      } else {
        leaves = ['none'];
      }
      
      totalWorkedSeconds += calculateDailyWorkSeconds(record.checkIn, record.checkOut, leaves);
    }
  }

  const deficit = Math.max(0, totalRequiredSeconds - totalWorkedSeconds);
  const avgDailyRequiredSeconds = remainingWorkingDays > 0 ? Math.floor(deficit / remainingWorkingDays) : 0;

  return {
    totalRequiredSeconds,
    totalWorkedSeconds,
    totalWorkingDays,
    remainingWorkingDays,
    avgDailyRequiredSeconds
  };
};
