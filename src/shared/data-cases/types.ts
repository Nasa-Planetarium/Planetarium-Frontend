/**
 * 자료 케이스 처리기 — 타입(결정 E2·E3·E4, 목업 cases.js 이식).
 * 한 행(달·칸)을 「어떤 경우인가」로 가른다. 경우마다 처리기 클래스 하나, 고르기는 레지스트리(판정 순서 배열)뿐 — switch/case 금지.
 */
export type View = "value" | "raw_modis" | "raw_viirs";

/** 처리기가 읽는 행(계약 CalendarMonth · Comparison · 칸 속성의 공통 부분) */
export interface CaseRow {
  year?: number | null;
  month?: number | null;
  status?: string | null;
  value?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  /** 다른 모양(칸 속성 등)의 구간 열 이름 */
  lo?: number | null;
  hi?: number | null;
  raw_modis?: number | null;
  raw_viirs?: number | null;
  low_sample?: boolean | null;
  cmp?: { low_sample?: boolean | null } | null;
}

export interface CaseContext {
  view?: View;
}

/** 칸 표지(상태 하나) — 사전 shell.st.<id> */
export type CaseState = "out_of_range" | "before_sensor" | "missing" | "partial" | "nrt" | "ok";

export interface CaseResult {
  /** 맨 처음 맞은 경우 id */
  id: CaseId;
  /** 칸 표지 하나(우선순위 = 판정 순서) */
  st: CaseState;
  /** 표지가 아닌 플래그(interval_out · low_sample) — title·상세용 */
  flags: CaseId[];
  value: number | null;
  lo: number | null;
  hi: number | null;
  /** 사전 키(화면이 t() 로 바꾼다): shell.st.<st> */
  wordKey: string;
}

export type CaseId = "out_of_range" | "before_sensor" | "missing" | "interval_out" | "partial" | "nrt" | "low_sample" | "ok";

/** 처리기가 바꾸는 값(부분) */
export type CasePatch = Partial<Pick<CaseResult, "value" | "lo" | "hi">>;

export interface CaseHandler {
  readonly id: CaseId;
  /** 이 경우면 뒤 경우를 보지 않는다(값이 없음) */
  readonly stop: boolean;
  /** 표지가 아니라 플래그 */
  readonly flag: boolean;
  /** 칸 표지(플래그면 없음) */
  readonly st: CaseState | null;
  /** 에러 코드(방법 화면 「자료 상태」 카드) */
  readonly code: string;
  test(row: CaseRow, ctx: CaseContext): boolean;
  apply(row: CaseRow, ctx: CaseContext): CasePatch;
}
