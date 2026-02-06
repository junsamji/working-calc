
export type LeaveType = 'none' | '8H' | '6H' | '4H' | '2H' | 'halfday';

export interface WorkRecord {
  checkIn: string;  // HH:mm:ss
  checkOut: string; // HH:mm:ss
  leaveTypes: LeaveType[];
  resultTime?: string; // 변경: 계산된 근무 시간을 HH:mm:ss 문자열로 저장
}

export interface MonthlyData {
  [day: string]: WorkRecord; // Key: "YYYY-MM-DD"
}

export interface Holiday {
  date: string; // "YYYY-MM-DD"
  name: string;
}

export interface CalculationResult {
  totalRequiredSeconds: number;
  totalWorkedSeconds: number;
  totalWorkingDays: number;
  remainingWorkingDays: number;
  avgDailyRequiredSeconds: number;
}

// Firebase 저장용 포맷팅된 통계 데이터
export interface MonthlySummary {
  totalWorkingDays: number;
  remainingWorkingDays: number;
  requiredTime: string;    // HH:mm:ss
  workedTime: string;      // HH:mm:ss
  avgTargetTime: string;   // HH:mm:ss
  updatedAt: number;
}
