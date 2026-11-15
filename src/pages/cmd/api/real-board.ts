import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { calendarQuery } from "@/entities/month-value";
import { methodQuery } from "@/entities/release";
import { bboxArea, bboxCenter, HOTSPOT_MAX_AREA, HOTSPOT_MAX_DAYS, type AoiRec } from "@/features/pick-aoi";
import { api, ApiError, heavyRetry, heavyRetryDelay, qk, unwrap } from "@/shared/api";
import type { Board, Cells, Cm, Day } from "../model/cmd";
import { SEASON_MONTHS, type Query } from "../model/cmd";

/**
 * 지휘 통계 위성 통계 = 실제 자료(/api/v1) — 2026-11-15 사용자 지적 「목은 조기경보·소방현장지휘(경보·출동)뿐, 다른 화면은 실제 데이터 전 지역」.
 * - 달 값: 행(고른 범위의 아래 단)마다 GET /aois/{id}/calendar 그대로(value = 보정 지표, raw_modis · raw_viirs = 원시). 다시 계산하지 않는다.
 * - 시간대 분포 · 지도 점: GET /hotspots(aoi_id, layer=reference) 을 위성 관측 시각으로 묶기만. 실서버는 한 번에 92일 · 100 제곱도 이하만 낸다(잰 것) →
 *   지난 730일을 92일 창 여러 번으로 받고, 넓은 범위(큰 나라)는 「범위를 좁혀 달라」고 적는다(점을 지어내지 않음).
 * - 대응 성과(첫 도착·자원 가동·탄 면적)만 목(AgencyPort) — 이 파일은 그 몫을 만들지 않는다.
 */

interface CalRow {
  year: number;
  month: number;
  value: number | null;
  raw_modis?: number | null;
  raw_viirs?: number | null;
  status: string;
  as_of_date?: string | null;
}
interface Hot {
  latitude: number;
  longitude: number;
  acq_datetime_utc: string;
  date_local?: string;
  instrument?: string;
  satellite?: string;
  frp?: number | null;
  confidence?: string | number | null;
}

const FIRST = 2001;
const VIIRS_START = 2012;
const pad2 = (n: number) => String(n).padStart(2, "0");
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** 판 끝(진행 중인 달 · 그 달 자료 날짜)을 캘린더에서 읽는다 */
function cmOf(rows: CalRow[]): Cm {
  const live = rows.filter((r) => r.status !== "out_of_range" && r.year >= FIRST);
  const last = live.reduce<CalRow | null>((a, r) => (!a || r.year * 12 + r.month > a.year * 12 + a.month ? r : a), null);
  const ly = last?.year ?? 2026;
  const lm = last?.month ?? 11;
  const days = dim(ly, lm);
  const asOf = last?.as_of_date && last.status !== "ok" ? +last.as_of_date.slice(8, 10) : days;
  return {
    first_year: FIRST,
    last_year: ly,
    last_month: lm,
    last_day: Math.max(1, Math.min(days, asOf)),
    days_in_last_month: days,
    viirs_start_year: VIIRS_START,
    baseline_from: FIRST,
    baseline_to: ly - 1,
    min_limited: 8,
    min_unavailable: 3,
  };
}

function cellsOf(cm: Cm, rows: CalRow[]): Cells {
  const at = new Map(rows.map((r) => [r.year * 12 + r.month, r] as const));
  const n = (cm.last_year - cm.first_year) * 12 + cm.last_month;
  const out: Cells = { modis: [], viirs: [], harm: [], miss: [], miss_s: [] };
  for (let i = 0; i < n; i++) {
    const y = cm.first_year + Math.floor(i / 12);
    const m = (i % 12) + 1;
    const r = at.get(y * 12 + m);
    const miss = !r || r.status === "missing";
    out.harm.push(miss ? null : (r.value ?? null));
    out.modis.push(r?.raw_modis ?? null);
    out.viirs.push(y < VIIRS_START ? null : (r?.raw_viirs ?? null));
    out.miss.push(miss ? `${y}-${m}` : null);
    out.miss_s.push(miss ? [y < VIIRS_START ? "MODIS" : "VIIRS"] : null);
  }
  return out;
}

/** 92일 이하 창들(끝 날짜부터 거꾸로) */
export function windows(start: string, end: string, max = HOTSPOT_MAX_DAYS): [string, string][] {
  const out: [string, string][] = [];
  let e = end;
  while (e >= start) {
    const s0 = addDays(e, -(max - 1));
    const s = s0 < start ? start : s0;
    out.push([s, e]);
    e = addDays(s, -1);
  }
  return out;
}

/** 한 지역·한 창의 점 전부(쪽 나눔 최대 5쪽) */
async function hotPage(aoiId: string, start: string, end: string, signal: AbortSignal): Promise<{ pts: Hot[]; total: number }> {
  const pts: Hot[] = [];
  let cursor: string | undefined;
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const r = (await api
      .GET("/hotspots", { params: { query: { aoi_id: aoiId, start, end, limit: 10000, ...(cursor ? { cursor } : {}) } }, signal })
      .then(unwrap)) as unknown as { hotspots?: Hot[]; total?: number; next_cursor?: string | null };
    pts.push(...(r.hotspots ?? []));
    total = r.total ?? pts.length;
    if (!r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return { pts, total };
}
export const hotWindowQuery = (aoiId: string, start: string, end: string, mv: string | null, on: boolean) => ({
  queryKey: qk("hotspots", { aoi_id: aoiId, start, end, all: 1 }, mv),
  queryFn: ({ signal }: { signal: AbortSignal }) => hotPage(aoiId, start, end, signal),
  enabled: !!mv && on,
  staleTime: 60 * 60 * 1000,
  /* 실서버 heavy 한도(429): Retry-After 만큼 기다려 다시 — 예전엔 retry:false 라 강원 12창이 모두 429 로 끝났다(잰 것 2026-11-15) */
  retry: heavyRetry,
  retryDelay: heavyRetryDelay,
});

/** 시각(0–23): 한국 = KST, 밖 = 현지 태양시(경도/15 — 실서버 date_local 과 같은 기준) */
const KST = 9;
function localOf(h: Hot, kor: boolean): { date: string; hour: number } | null {
  const t = Date.parse(h.acq_datetime_utc);
  if (!Number.isFinite(t)) return null;
  const off = kor ? KST : h.longitude / 15;
  const d = new Date(t + off * 3600e3);
  return { date: kor ? d.toISOString().slice(0, 10) : (h.date_local ?? d.toISOString().slice(0, 10)), hour: d.getUTCHours() };
}

/** 점 → 일×시각 칸(그날 점 수 = total, 결측 날 없음 — 점 자료는 감지 0 과 결측을 가르지 않는다) */
export function daysOf(pts: Hot[], start: string, end: string, kor: boolean): Day[] {
  const by = new Map<string, number[]>();
  pts.forEach((h) => {
    const l = localOf(h, kor);
    if (!l || l.date < start || l.date > end) return;
    const v = by.get(l.date) ?? new Array<number>(24).fill(0);
    v[l.hour] = (v[l.hour] ?? 0) + 1;
    by.set(l.date, v);
  });
  const out: Day[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    const v = by.get(d) ?? new Array<number>(24).fill(0);
    out.push({ date: d, dow, we: dow === 0 || dow === 6, total: v.reduce((a, b) => a + b, 0), v, miss: null });
  }
  return out;
}

const CONF: Record<string, number> = { l: 20, n: 60, h: 90 };
const confOf = (c: Hot["confidence"]) => (typeof c === "number" ? c : (CONF[String(c ?? "").toLowerCase()] ?? 60));
/** 지도 점: 계절·신뢰도·FRP 거름만(값은 그대로) */
export function ptsOf(pts: Hot[], q: Query) {
  const ms = SEASON_MONTHS[q.season];
  return pts
    .filter((h) => ms.includes(+h.acq_datetime_utc.slice(5, 7)) && confOf(h.confidence) >= q.conf && (h.frp ?? 0) >= q.frp)
    .filter((h) => q.sensor !== "viirs" || h.instrument !== "MODIS")
    .filter((h) => q.sensor !== "modis" || h.instrument === "MODIS")
    .map((h) => ({ lat: h.latitude, lon: h.longitude, frp: h.frp ?? 0 }));
}

export type PtsState = "ok" | "pending" | "wide" | "rate" | "error";
const isRate = (e: unknown) => e instanceof ApiError && e.status === 429;

/**
 * 실제 묶음. rows = 고른 범위의 아래 단(행) · scope = 범위 AOI · sel = 고른 행(시간대·지도 점 범위).
 * mapYear = 지도 연도(누적이면 null — 26년 점은 창 100여 번이라 받지 않고 행 원으로 보인다).
 */
export function useRealBoard(opts: { rows: AoiRec[]; scope: AoiRec | null; sel: string[]; kor: boolean; mapYear: number | null; names: (a: AoiRec) => string }) {
  const { rows, scope, sel, kor, mapYear } = opts;
  const mq = useQuery(methodQuery());
  const mv = mq.data?.method_version ?? null;
  const cals = useQueries({ queries: rows.map((r) => calendarQuery(r.aoi_id, { start_year: 2000, end_year: 2026 }, mv)) });
  const calKey = cals.map((c) => (c.data ? 1 : 0)).join("");
  const allCal = cals.length > 0 && cals.every((c) => !!c.data);

  const base = useMemo(() => {
    if (!allCal) return null;
    const rs = cals.map((c) => ((c.data as unknown as { months?: CalRow[] }).months ?? []) as CalRow[]);
    const cm = cmOf(rs[0] ?? []);
    const cells: Record<string, Cells> = {};
    rows.forEach((r, i) => (cells[r.aoi_id] = cellsOf(cm, rs[i] ?? [])));
    const missing = new Map<string, { key: string; reason: string; sensors: string[] }>();
    Object.values(cells).forEach((c) => c.miss.forEach((k, i) => k && !missing.has(k) && missing.set(k, { key: k, reason: "", sensors: c.miss_s[i] ?? [] })));
    return { cm, cells, missing: [...missing.values()] };
    // cals 는 렌더마다 새 배열 — 받은 여부(calKey)로만 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCal, calKey, rows]);

  /* 점 범위: 고른 행(최대 6)이 있으면 그 행들, 아니면 범위 하나. 100 제곱도 넘는 것이 하나라도 있으면 받지 않는다 */
  const ptAois = useMemo(() => {
    const pick = sel.length && sel.length <= 6 ? rows.filter((r) => sel.includes(r.aoi_id)) : scope ? [scope] : [];
    return pick;
  }, [sel, rows, scope]);
  const wide = !ptAois.length || ptAois.some((a) => bboxArea(a.bbox) > HOTSPOT_MAX_AREA);

  /* 시간대: 지난 730일(전년 비교 몫까지) */
  const end = base ? `${base.cm.last_year}-${pad2(base.cm.last_month)}-${pad2(base.cm.last_day)}` : null;
  const hStart = end ? addDays(end, -729) : null;
  /* 지도 점(고른 해 · 1년 = 92일 창 4번)을 먼저 받는다 — heavy 한도(분당 약 30 토큰)를 시간대 창 8번과 한꺼번에 쓰면 지도가 429 로 비었다 */
  const yWins = useMemo(() => (mapYear && end ? windows(`${mapYear}-01-01`, `${mapYear}-12-31` > end ? end : `${mapYear}-12-31`) : []), [mapYear, end]);
  const yq = useQueries({ queries: ptAois.flatMap((a) => yWins.map(([s, e]) => hotWindowQuery(a.aoi_id, s, e, mv, !wide))) });
  const yKey = yq.map((x) => (x.data ? 1 : x.error ? 2 : 0)).join("");
  const yDone = !mapYear || wide || (yq.length > 0 && yq.every((x) => !!x.data || !!x.error));
  const hWins = useMemo(() => (end && hStart ? windows(hStart, end) : []), [end, hStart]);
  const hq = useQueries({ queries: ptAois.flatMap((a) => hWins.map(([s, e]) => hotWindowQuery(a.aoi_id, s, e, mv, !wide && yDone))) });
  const hKey = hq.map((x) => (x.data ? 1 : x.error ? 2 : 0)).join("");
  const hourly = useMemo(() => {
    if (!end || !hStart) return null;
    if (wide) return { state: "wide" as PtsState, days: [] as Day[] };
    if (hq.some((x) => x.error)) return { state: (hq.some((x) => isRate(x.error)) ? "rate" : "error") as PtsState, days: [] as Day[] };
    if (!hq.length || hq.some((x) => !x.data)) return { state: "pending" as PtsState, days: [] as Day[] };
    const pts = hq.flatMap((x) => x.data?.pts ?? []);
    return { state: "ok" as PtsState, days: daysOf(pts, hStart, end, kor) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hKey, wide, end, hStart, kor]);


  const yearPts = useMemo((): { state: PtsState; pts: Hot[]; total: number } => {
    if (!mapYear) return { state: "ok", pts: [], total: 0 };
    if (wide) return { state: "wide", pts: [], total: 0 };
    if (yq.some((x) => x.error)) return { state: yq.some((x) => isRate(x.error)) ? "rate" : "error", pts: [], total: 0 };
    if (!yq.length || yq.some((x) => !x.data)) return { state: "pending", pts: [], total: 0 };
    const pts = yq.flatMap((x) => x.data?.pts ?? []);
    return { state: "ok", pts, total: yq.reduce((t, x) => t + (x.data?.total ?? 0), 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yKey, wide, mapYear]);

  /* 검증 요약: 한국 = 실서버 m2v_evaluation.korea_pooled 의 채택 모델(월 합계 MAE · 편향 비) — 밖은 없음 */
  const ev = (mq.data as { meta?: { m2v_evaluation?: { adopted?: string; korea_pooled?: Record<string, { MAE?: number; bias?: number }> } } } | undefined)?.meta?.m2v_evaluation;
  const kp = ev?.adopted ? ev.korea_pooled?.[ev.adopted] : undefined;
  const dataVersion = (mq.data as { data_version?: string } | undefined)?.data_version ?? "";

  const board: Board | null = useMemo(() => {
    if (!base || !hourly) return null;
    return {
      cm: base.cm,
      kor,
      regions: rows.map((r) => {
        const c = bboxCenter(r.bbox);
        const b = r.bbox ?? [0, 0, 0, 0];
        const kx = Math.cos((((c?.lat ?? 0) * Math.PI) / 180) as number);
        return { id: r.aoi_id, name: opts.names(r), lat: c?.lat ?? 0, lon: c?.lon ?? 0, area_km2: Math.round(((b[2] ?? 0) - (b[0] ?? 0)) * 111 * kx * ((b[3] ?? 0) - (b[1] ?? 0)) * 111), ledger: false };
      }),
      cells: base.cells,
      shocks: [],
      missing: base.missing,
      slope: 0,
      validation: { n_loo: 0, mae_month: kor && kp?.MAE != null ? Math.round(kp.MAE * 10) / 10 : null, bias_pct: kor && kp?.bias != null ? Math.round((kp.bias - 1) * 1000) / 10 : null },
      provenance: { method_version: mv ?? "", data_version: dataVersion, updated_at: end ?? "" },
      hourly: { source: "sat", sel, days: hourly.days },
      response: null,
    };
    // opts.names 는 렌더마다 새 함수 — rows·이름 사전이 같으면 같은 결과
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, hourly, rows, kor, mv, dataVersion, end, sel, kp?.MAE, kp?.bias]);

  return {
    board,
    hourlyState: hourly?.state ?? ("pending" as PtsState),
    yearPts,
    pending: !allCal,
    error: cals.find((c) => c.error)?.error ?? null,
  };
}
