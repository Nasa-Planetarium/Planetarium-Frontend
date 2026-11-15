/**
 * 위성 상태 화면 모델(순수) — 응답 행을 위성별로 세고 「ok 아닌 날」을 고른다. 상태 판정은 파일 값 그대로(다시 정하지 않음).
 */
export const SATS = ["Terra", "Aqua", "S-NPP", "NOAA-20", "NOAA-21"] as const;
export const DAY_ST = ["ok", "low", "missing", "partial"] as const;
export type DaySt = (typeof DAY_ST)[number];

export interface DayLike {
  satellite: string;
  date_utc: string;
  status: string;
  note?: string | null;
}
export interface SatDaySum {
  satellite: string;
  days: number;
  counts: Record<DaySt, number>;
  /** ok 아닌 날(날짜 순) */
  off: { date: string; status: DaySt; note: string | null }[];
}

const isSt = (s: string): s is DaySt => (DAY_ST as readonly string[]).includes(s);

/** 위성별 요약. 위성 순서 = SATS(그 밖의 이름은 뒤에) · 행이 없는 위성은 빼지 않고 days 0 으로 두지 않는다(그 기간 자료 없음 = 줄 없음) */
export function satDaySummary(days: readonly DayLike[] | null | undefined): SatDaySum[] {
  const by = new Map<string, SatDaySum>();
  for (const d of days ?? []) {
    let e = by.get(d.satellite);
    if (!e) {
      e = { satellite: d.satellite, days: 0, counts: { ok: 0, low: 0, missing: 0, partial: 0 }, off: [] };
      by.set(d.satellite, e);
    }
    e.days++;
    if (!isSt(d.status)) continue;
    e.counts[d.status]++;
    if (d.status !== "ok") e.off.push({ date: d.date_utc, status: d.status, note: d.note ?? null });
  }
  const rank = (s: string) => {
    const i = (SATS as readonly string[]).indexOf(s);
    return i < 0 ? 99 : i;
  };
  return [...by.values()].sort((a, b) => rank(a.satellite) - rank(b.satellite) || a.satellite.localeCompare(b.satellite)).map((e) => ({ ...e, off: e.off.sort((a, b) => a.date.localeCompare(b.date)) }));
}

export interface MonthLike {
  satellite: string;
  year: number;
  month: number;
  obs_days?: number | null;
  low_days?: number | null;
  missing_days?: number | null;
  first_day?: string | null;
  last_day?: string | null;
  month_status: string;
}
export interface SatSpan {
  satellite: string;
  first: string | null;
  last: string | null;
  months: number;
  obs: number;
  low: number;
  missing: number;
  partialMonths: number;
}
/** 위성 × 달 행 → 위성별 기간·합(파일 열 obs_days·low_days·missing_days 의 Σ) */
export function satSpans(months: readonly MonthLike[] | null | undefined): SatSpan[] {
  const by = new Map<string, SatSpan>();
  for (const r of months ?? []) {
    let e = by.get(r.satellite);
    if (!e) {
      e = { satellite: r.satellite, first: null, last: null, months: 0, obs: 0, low: 0, missing: 0, partialMonths: 0 };
      by.set(r.satellite, e);
    }
    e.months++;
    e.obs += r.obs_days ?? 0;
    e.low += r.low_days ?? 0;
    e.missing += r.missing_days ?? 0;
    if (r.month_status === "partial") e.partialMonths++;
    if (r.first_day && (!e.first || r.first_day < e.first)) e.first = r.first_day;
    if (r.last_day && (!e.last || r.last_day > e.last)) e.last = r.last_day;
  }
  const rank = (s: string) => {
    const i = (SATS as readonly string[]).indexOf(s);
    return i < 0 ? 99 : i;
  };
  return [...by.values()].sort((a, b) => rank(a.satellite) - rank(b.satellite));
}
