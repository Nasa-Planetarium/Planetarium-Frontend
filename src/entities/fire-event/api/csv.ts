import { getCsvText } from "@/shared/api";

/** 한 번에 받는 사건 수 상한(계약 fire_events_limit_max = 1000) */
export const EVENTS_CSV_LIMIT = 1000;

/**
 * 화재 사건 CSV — 서버 CSV(GET /fire-events?format=csv) 그대로. 기간 = 겹침 규칙(현지 날짜), 큰 사건(sum_weight) 순, 최대 1,000건.
 */
export const fireEventsCsv = (aoiId: string, start: string, end: string) =>
  getCsvText("/fire-events", { aoi_id: aoiId, start, end, sort: "sum_weight", limit: EVENTS_CSV_LIMIT });
