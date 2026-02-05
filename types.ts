
export type LeaveType = 'none' | '8H' | '6H' | '4H' | '2H' | 'halfday';

export interface WorkRecord {
  checkIn: string;  // HH:mm:ss
  checkOut: string; // HH:mm:ss
  leaveTypes: LeaveType[];
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
  totalWorkingDays: number; // 추가: 해당 월의 총 평일/근무일 수
  remainingWorkingDays: number;
  avgDailyRequiredSeconds: number;
}
