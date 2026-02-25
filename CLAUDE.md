# CLAUDE.md — 근무시간 계산기 프로젝트

## 프로젝트 개요

**Korean Work Hours Calculator (근무시간 계산기)**
한국 법정 근로시간 기준으로 월별 근무시간을 추적·계산하는 웹 앱.
GitHub Pages에 배포됨: https://junsamji.github.io/working-calc

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | React 19 + TypeScript 5.8 |
| 빌드 도구 | Vite 6.2 |
| CSS | Tailwind CSS (CDN, index.html에서 로드) |
| 백엔드/DB | Firebase Realtime Database (ESM CDN으로 직접 import) |
| 배포 | GitHub Pages (`gh-pages` 패키지) |

## 프로젝트 구조

```
working-calc/
├── App.tsx              # 메인 컴포넌트 (전체 UI + 상태 관리, ~800줄 단일 파일)
├── index.tsx            # React 앱 진입점
├── index.html           # HTML 템플릿 (Tailwind CDN, ESM importmap 포함)
├── types.ts             # TypeScript 타입 정의
├── constants.ts         # 공휴일 목록(2025~2026) + 휴가 유형 상수
├── utils/
│   └── timeUtils.ts     # 시간 계산 유틸리티 함수들
├── vite.config.ts       # Vite 설정 (환경변수 주입, base URL 설정)
├── .env.local           # 환경변수 (git 제외)
└── dist/                # 빌드 산출물
```

## 주요 기능

1. **월별 캘린더 뷰** — 날짜를 클릭해 출퇴근 시간 입력
2. **ScrollTimePicker** — 드래그/입력 방식의 커스텀 시간 선택 컴포넌트
3. **휴가 유형 관리** — `8H / 6H / 4H / 2H / 하프데이` 복수 선택 가능 (최대 합계 8시간)
4. **월간 통계** — 총 근무일수, 남은 근무일수, 필수 근무시간, 근무한 시간, 하루 평균 목표
5. **한국 공휴일** — 2025~2026년 하드코딩 (`constants.ts`)
6. **커스텀 휴일 관리** — 인증 후 날짜 추가/수정/삭제 가능
7. **클라우드 동기화** — Firebase RTDB에 월별 데이터 저장/불러오기 (인증 필요)
8. **게스트 모드** — 로컬스토리지에만 저장 (인증 불필요)
9. **모바일 반응형** — Tailwind 브레이크포인트(`md:`) 기준으로 PC/모바일 레이아웃 분기

## 데이터 저장 구조

### 로컬스토리지
- 키: `work-data-YYYY-MM`
- 값: `MonthlyData` 객체 (날짜 → WorkRecord 맵)

### Firebase Realtime Database
```
users/{AUTH_KEY}/
  attendance/{YYYY-MM}/
    records: MonthlyData
    summary: MonthlySummary
    updatedAt: timestamp
  settings/
    holidays: HolidayMap
```

## 환경변수 (`.env.local`)

| 변수명 | 용도 |
|--------|------|
| `DB_API_KEY` | Firebase API 키 |
| `AUTH_KEY` | 클라우드 동기화 인증 코드 (단일 사용자용 고정 코드) |
| `GEMINI_API_KEY` | Vite 설정에 정의되어 있으나 현재 미사용 |

> 환경변수는 Vite `define`으로 `process.env.*`에 주입됨

## 근무 시간 계산 규칙 (`utils/timeUtils.ts`)

- 하루 기준 필수 근무시간: **8시간**
- **점심시간(12:00~13:00)은 자동 차감**
- 휴가 시간이 있으면 해당 시간만큼 근무 시간에 합산 (최대 8시간)
- 출퇴근 시간 + 휴가 시간 중복 입력 시, **휴가가 우선** (출퇴근 시간 초기화)
- 주말(토·일) + 공휴일은 근무일에서 제외

## 개발 명령어

```bash
npm run dev       # 로컬 개발 서버 실행
npm run build     # 프로덕션 빌드 (dist/ 생성)
npm run deploy    # GitHub Pages 배포 (build 후 gh-pages로 push)
npm run preview   # 빌드 결과물 로컬 미리보기
```

## 주요 컴포넌트 구조 (App.tsx)

| 컴포넌트/함수 | 역할 |
|---------------|------|
| `SegmentInput` | 시:분:초 개별 입력 필드 |
| `DragSegment` | 드래그로 시간 조절하는 스크롤 세그먼트 |
| `ScrollTimePicker` | 위 두 컴포넌트를 조합한 시간 선택기 |
| `App` (메인) | 전체 상태 관리 + 모든 모달 + 캘린더 렌더링 |
| `renderCalendarDays()` | 월 캘린더 날짜 셀 렌더링 (일반/휴일관리 모드 겸용) |
| `executeCloudSave/Load()` | Firebase 저장/불러오기 |
| `handleAuthSubmit()` | 인증 코드 검증 |

## 주의사항

- **Firebase SDK**는 npm 패키지가 아닌 CDN ESM(`gstatic.com`)으로 직접 import됨 — 번들에 포함되지 않음
- **Tailwind CSS**도 CDN 방식 — PostCSS 설정 불필요
- `App.tsx`는 단일 파일에 모든 로직이 포함된 모놀리식 구조
- 인증은 단일 고정 코드 방식 (개인 전용 앱)
- GitHub Pages 배포 시 `base: '/working-calc/'` 설정 필수
