/**
 * MSW 처리기(v1.2 새 층): 산불 기상 위험도 GET /aois/{aoiId}/fwi · 확산 nowcast GET /spread-nowcast.
 *
 * 원천 = public/data/snap/v12/{fwi,spread}.json — scripts/snap-v12-fwi-spread.py 가 release data-v1.2-2026-11-15 의
 * fwi_aoi_day.parquet(295 AOI × 마지막 14일) · spread_nowcast_latest.parquet(10,189칸 전부)에서 값 그대로 잘라 만든 것.
 * 이 파일이 하는 일은 계약(contract/openapi.yaml) 모양으로 바꾸기와, 계약이 「서버가 한다」고 정한 규칙뿐이다:
 *  - spread level: low < 0.05 ≤ moderate ≤ 0.20 < high(계약 SpreadNowcast)
 *  - coverage: 범위 안 AOI(KR · SIDO_* · SGG_* · ADM0_ARG · ADM1_ARG-*) / 범위 상자(KR [124.5,33,132,38.7] · ARG [-73.5,-55.2,-53.4,-21.5])
 *  - FWI: date 없음 → 마지막 날, date > as_of_date → day null(오류 아님)
 * 스냅숏에 없는 옛날(마지막 14일 앞)은 503 data_not_loaded 로 답한다 — 지어낸 값을 내지 않는다.
 * 순수 함수(fwiBody · spreadBody)는 snapshot 시험(v12-fwi-spread.test.ts)이 직접 부른다.
 */
import { bypass, http, HttpResponse } from "msw";
import type { components } from "@/shared/api";

type S = components["schemas"];
const RELEASE = "data-v1.2-2026-11-15";
const FWI_NOTICE = "기상으로 본 산불 위험도(캐나다 FWI, NASA POWER 일 자료 근사). 실제 발화·확산을 예측하지 않음.";
const SPREAD_NOTICE =
  "위성 감지 기반 단기 확산 가능성입니다. 물리 시뮬레이션이 아니며, 오늘 감지 지점에서 반경 약 7.5 km 밖으로 번지는 경우와 새로 발생하는 불은 예측 대상이 아닙니다.";

type FwiRow = [string, number | null, number | null, S["FwiDay"]["fwi_class"], number | null, S["FwiDay"]["fwi_rel_class"], number | null, number | null, number | null, number | null, number | null];
export interface FwiSnap {
  release: string;
  aois: Record<string, { name: string | null; level: string; as_of_date: string; days: FwiRow[] }>;
}
type SpreadRow = ["KR" | "ARG", string | null, number, number, number, 0 | 1, number | null, number | null, number[]];
export interface SpreadSnap {
  release: string;
  as_of_date: string;
  target_date: string;
  model: string | null;
  source_satellite: string | null;
  weather_available: boolean;
  weather_lag_days: number | null;
  aoi_ids: string[];
  cells: SpreadRow[];
}

export type Out = { status: 200; body: unknown } | { status: 400 | 503; code: string; errorNo: number; detail: string; param?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (r: FwiRow): S["FwiDay"] => ({
  date: r[0],
  fwi_mean: r[1],
  fwi_max: r[2],
  fwi_class: r[3],
  fwi_pct: r[4],
  fwi_rel_class: r[5],
  isi_mean: r[6],
  bui_mean: r[7],
  ffmc_mean: r[8],
  dc_mean: r[9],
  n_cells: r[10],
});

/** GET /aois/{aoiId}/fwi 본문(계약 FwiResponse) */
export function fwiBody(snap: FwiSnap, aoiId: string, q: { date?: string | null; start?: string | null; end?: string | null }): Out {
  const bad = (param: string, detail: string): Out => ({ status: 400, code: "invalid_param", errorNo: 10001, detail, param });
  for (const k of ["date", "start", "end"] as const) if (q[k] && !DATE.test(q[k]!)) return bad(k, `${k} must be YYYY-MM-DD`);
  if (q.date && (q.start || q.end)) return bad("date", "date with start/end");
  if (!!q.start !== !!q.end) return bad(q.start ? "end" : "start", "start and end together");
  const a = snap.aois[aoiId];
  if (!a) {
    return {
      status: 200,
      body: { aoi_id: aoiId, name: null, as_of_date: null, badge: "fwi_rel_class", date: q.date ?? null, day: null, series: [], coverage: { available: false, scope: "kr_arg_fwi", reason: "out_of_coverage" }, notice: FWI_NOTICE, data_release: RELEASE },
    };
  }
  const first = a.days[0]?.[0] ?? a.as_of_date;
  const base = { aoi_id: aoiId, name: a.name, as_of_date: a.as_of_date, badge: "fwi_rel_class", coverage: { available: true, scope: "kr_arg_fwi", reason: null }, notice: FWI_NOTICE, data_release: RELEASE };
  if (q.start && q.end) {
    if (q.start > q.end) return bad("start", "start > end");
    if (q.start < first) return { status: 503, code: "data_not_loaded", errorNo: 50501, detail: `snapshot keeps ${first}..${a.as_of_date} only` };
    return { status: 200, body: { ...base, date: null, day: null, series: a.days.filter((r) => r[0] >= q.start! && r[0] <= q.end!).map(day) } };
  }
  const d = q.date ?? a.as_of_date;
  if (d > a.as_of_date) return { status: 200, body: { ...base, date: d, day: null, series: [] } };
  if (d < first) return { status: 503, code: "data_not_loaded", errorNo: 50501, detail: `snapshot keeps ${first}..${a.as_of_date} only` };
  const r = a.days.find((x) => x[0] === d);
  return { status: 200, body: { ...base, date: d, day: r ? day(r) : null, series: [] } };
}

/** 계약 규칙: low < 0.05 ≤ moderate ≤ 0.20 < high */
export const spreadLevel = (p: number): S["SpreadCell"]["level"] => (p > 0.2 ? "high" : p >= 0.05 ? "moderate" : "low");
const LV_RANK = { low: 0, moderate: 1, high: 2 } as const;
const inScope = (id: string) => id === "KR" || id === "ADM0_ARG" || id.startsWith("SIDO_") || id.startsWith("SGG_") || id.startsWith("ADM1_ARG-");
const BOXES: [number, number, number, number][] = [
  [124.5, 33.0, 132.0, 38.7],
  [-73.5, -55.2, -53.4, -21.5],
];

/** GET /spread-nowcast 본문(계약 SpreadNowcast) */
export function spreadBody(snap: SpreadSnap, q: { aoi_id?: string | null; bbox?: string | null; min_level?: string | null }): Out {
  const bad = (param: string, detail: string): Out => ({ status: 400, code: "invalid_param", errorNo: 10001, detail, param });
  if (!!q.aoi_id === !!q.bbox) return bad("aoi_id", "exactly one of aoi_id, bbox");
  const ml = (q.min_level ?? "low") as keyof typeof LV_RANK;
  if (!(ml in LV_RANK)) return bad("min_level", "low|moderate|high");
  let bbox: [number, number, number, number] | null = null;
  if (q.bbox) {
    const b = q.bbox.split(",").map(Number);
    if (b.length !== 4 || b.some((x) => !Number.isFinite(x)) || b[0]! >= b[2]! || b[1]! >= b[3]!) return bad("bbox", "west,south,east,north");
    bbox = b as [number, number, number, number];
  }
  const avail = q.aoi_id ? inScope(q.aoi_id) : BOXES.some((x) => bbox![0] < x[2] && x[0] < bbox![2] && bbox![1] < x[3] && x[1] < bbox![3]);
  const k = q.aoi_id ? snap.aoi_ids.indexOf(q.aoi_id) : -1;
  const pick = (r: SpreadRow) => (q.aoi_id ? k >= 0 && r[8].includes(k) : r[3] >= bbox![0] && r[3] <= bbox![2] && r[2] >= bbox![1] && r[2] <= bbox![3]);
  const cells = avail
    ? snap.cells
        .filter((r) => pick(r) && LV_RANK[spreadLevel(r[4])] >= LV_RANK[ml])
        .map((r) => ({ region: r[0], cand_adm0: r[1], cell_lat: r[2], cell_lon: r[3], cell_size_deg: 0.025, p_spread: r[4], level: spreadLevel(r[4]), active_today: r[5] === 1, fire_event_days: r[6], n_det_today_7x7: r[7] }))
    : [];
  return {
    status: 200,
    body: {
      as_of_date: snap.as_of_date,
      target_date: snap.target_date,
      model: snap.model,
      source_satellite: snap.source_satellite,
      weather_available: snap.weather_available,
      weather_lag_days: snap.weather_lag_days,
      ...(q.aoi_id ? { aoi_id: q.aoi_id } : { bbox }),
      count: cells.length,
      cells,
      coverage: { available: avail, scope: "kr_box_arg_spread", reason: avail ? null : "out_of_coverage" },
      notice: SPREAD_NOTICE,
      data_release: RELEASE,
    },
  };
}

const SNAP = "/data/snap/v12";
let fwiP: Promise<FwiSnap> | null = null;
let spreadP: Promise<SpreadSnap> | null = null;
const load = <T,>(p: string): Promise<T> => fetch(bypass(new Request(new URL(p, location.origin)))).then((r) => r.json() as Promise<T>);

let reqN = 0;
function reply(o: Out, instance: string, mv: string) {
  if (o.status === 200) return HttpResponse.json(o.body as never, { headers: { "X-Method-Version": mv, "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate" } });
  return HttpResponse.json(
    { type: `https://emberline.example/errors/${o.code}`, title: o.code, status: o.status, code: o.code, error_no: o.errorNo, detail: o.detail, instance, request_id: `MSWV12${(++reqN).toString(36).toUpperCase().padStart(4, "0")}`, method_version: mv, ...(o.param ? { param: o.param } : {}) },
    { status: o.status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store", "X-Method-Version": mv } },
  );
}

/** base = "/api/v1". mv = 지금 스냅숏 판(handlers.ts 가 넘김) */
export function createV12FwiSpreadHandlers(base: string, methodVersion: () => Promise<string>) {
  const at = (p: string) => `${base.replace(/\/$/, "")}${p}`;
  return [
    http.get(at("/aois/:aoiId/fwi"), async ({ params, request }) => {
      const [snap, mv] = await Promise.all([(fwiP ??= load<FwiSnap>(`${SNAP}/fwi.json`)), methodVersion()]);
      const u = new URL(request.url);
      const g = (k: string) => u.searchParams.get(k);
      return reply(fwiBody(snap, String(params.aoiId), { date: g("date"), start: g("start"), end: g("end") }), u.pathname, mv);
    }),
    http.get(at("/spread-nowcast"), async ({ request }) => {
      const [snap, mv] = await Promise.all([(spreadP ??= load<SpreadSnap>(`${SNAP}/spread.json`)), methodVersion()]);
      const u = new URL(request.url);
      const g = (k: string) => u.searchParams.get(k);
      return reply(spreadBody(snap, { aoi_id: g("aoi_id"), bbox: g("bbox"), min_level: g("min_level") }), u.pathname, mv);
    }),
  ];
}
