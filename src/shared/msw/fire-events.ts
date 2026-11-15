/**
 * MSW 처리기 — 계약 GET /fire-events · GET /fire-events/{eventId} (F15, release data-v1.2-2026-11-15 fire_events.parquet).
 *
 * 원천 = public/data/layers/fire-events.json (scripts/snap-fire-events.py 가 release 파일에서 잘라 만든 것 — 값은 파일 그대로, A1).
 * - 한국(region KR)은 행 전부, 아르헨티나는 잘라 낸 일부(규칙 = 파일의 slices.ARG.rule). 그래서 아르헨티나 total 은
 *   (1) 기간 시작이 최근 창(recent_from) 이후면 실은 행으로 센 값, (2) 꼭 한 달 창이면 파일에서 센 month_counts, 그 밖은 null(계약: 「비싸면 null」).
 * - AOI 거르기 = 스냅숏의 소속 색인(계약 설명의 aoi_id 대응 규칙으로 스크립트가 미리 만든 것).
 * - 범위 밖 AOI · 상자 → 200 events [] + coverage.available=false (계약 Coverage, 「이 지역 자료 없음」).
 * 이 파일은 시험용이다(NEXT_PUBLIC_DATA_MODE=msw). 실제 백엔드가 오면 쓰이지 않는다.
 */
import { bypass, http, HttpResponse } from "msw";
import type { components } from "@/shared/api";

type S = components["schemas"];
type FireEvent = S["FireEvent"];
type Bbox = [number, number, number, number];

export interface EventsSnap {
  release: string;
  max_day: string;
  cols: (keyof FireEvent)[];
  rows: unknown[][];
  aoi: Record<string, number[]>;
  slices: { ARG: { recent_from: string } };
  month_counts: Record<string, Record<string, [number, number]>>;
}

const FILE = "/data/layers/fire-events.json";
let snap: Promise<EventsSnap> | null = null;
const getSnap = () => (snap ??= fetch(bypass(new Request(new URL(FILE, location.origin)))).then((r) => r.json() as Promise<EventsSnap>));

/* 범위 판정 상자(계약 /fire-events 설명: KR 추론 · ARG 잰 범위 + 0.3°) */
const BOXES: Record<"KR" | "ARG", Bbox> = { KR: [124.5, 33.0, 132.0, 38.7], ARG: [-73.5, -55.2, -53.4, -21.5] };
/* 범위 안 AOI(나머지 한국 AOI 는 SIDO_/SGG_ 접두로) — 아르헨티나 1급(ADM1_ARG-*)은 스냅숏에 색인이 없다 */
const inKr = (id: string) => id === "KR" || id.startsWith("SIDO_") || id.startsWith("SGG_");
const MAX_DAYS = 3700;
const NOTICE = "위성 확인 연소 면적(하한) — MODIS MCD64A1 로 확인한 면적이라 실제 피해 면적보다 작습니다(의성 2025-03 기준 공식 면적의 약 64%). 2012~2025 밖은 자료 없음, 0 은 확인 안 됨.";

let reqN = 0;
function problem(status: number, code: string, errorNo: number, detail: string, instance: string, mv: string, param?: string) {
  return HttpResponse.json(
    { type: `https://emberline.example/errors/${code}`, title: code, status, code, error_no: errorNo, detail, instance, request_id: `MSWE${(++reqN).toString(36).toUpperCase().padStart(5, "0")}`, method_version: mv, ...(param ? { param } : {}) },
    { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store", "X-Method-Version": mv } },
  );
}

const rowOf = (s: EventsSnap, r: unknown[]): FireEvent => Object.fromEntries(s.cols.map((c, i) => [c, r[i]])) as unknown as FireEvent;
const day = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3) + 1;
const overlaps = (a: Bbox, b: Bbox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** start..end 가 꼭 한 달(1일..말일)이면 "YYYY-MM" */
function wholeMonth(start: string, end: string): string | null {
  if (start.slice(0, 7) !== end.slice(0, 7) || start.slice(8) !== "01") return null;
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  return Number(end.slice(8)) === lastDay(y, m) ? start.slice(0, 7) : null;
}

type SortKey = "sum_weight" | "start_date" | "burned_area_km2";
/* 정렬(모델팀 기본 sum_weight 내림차순 · start_date 는 최근 먼저 · 면적은 큰 순, null 은 끝) — 같으면 event_id */
const SORTS: Record<SortKey, (a: FireEvent, b: FireEvent) => number> = {
  sum_weight: (a, b) => b.sum_weight - a.sum_weight || a.event_id.localeCompare(b.event_id),
  start_date: (a, b) => b.start_date.localeCompare(a.start_date) || a.event_id.localeCompare(b.event_id),
  burned_area_km2: (a, b) => (b.burned_area_km2 ?? -1) - (a.burned_area_km2 ?? -1) || a.event_id.localeCompare(b.event_id),
};

const headers = (mv: string, release: string) => ({ "X-Method-Version": mv, "X-Data-Version": release, "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate" });

/** base = "/api/v1". mvOf = 지금 판 method_version(스냅숏 korea.json 과 같은 값을 handlers.ts 가 넘긴다). load = 스냅숏 읽기(단위 시험이 파일로 바꿔 넣는다) */
export function createFireEventHandlers(base: string, mvOf: () => Promise<string>, load: () => Promise<EventsSnap> = getSnap) {
  const at = (p: string) => `${base.replace(/\/$/, "")}${p}`;
  return [
    http.get(at("/fire-events"), async ({ request }) => {
      const [s, mv] = await Promise.all([load(), mvOf()]);
      const u = new URL(request.url);
      const path = u.pathname;
      const q = u.searchParams;
      const aoiId = q.get("aoi_id") ?? q.get("aoi");
      const bboxRaw = q.getAll("bbox").join(",");
      if (!!aoiId === !!bboxRaw) return problem(400, "invalid_param", 40003, "exactly one of aoi_id, bbox", path, mv, "aoi_id");
      const start = day(q.get("start"));
      const end = day(q.get("end"));
      if (!start || !end || start > end) return problem(400, "invalid_param", 10001, "start/end YYYY-MM-DD, start <= end", path, mv, "start");
      if (days(start, end) > MAX_DAYS) return problem(400, "range_too_large", 40106, `period > ${MAX_DAYS} days`, path, mv, "end");
      const minDet = Number(q.get("min_det") ?? 1);
      const limit = Number(q.get("limit") ?? 100);
      const sortQ = (q.get("sort") ?? "sum_weight") as SortKey;
      if (!Number.isInteger(minDet) || minDet < 1 || !Number.isInteger(limit) || limit < 1 || limit > 1000 || !(sortQ in SORTS)) return problem(400, "invalid_param", 10001, "min_det/limit/sort", path, mv, "limit");
      let bbox: Bbox | null = null;
      if (bboxRaw) {
        const b = bboxRaw.split(",").map(Number);
        if (b.length !== 4 || b.some((x) => !Number.isFinite(x)) || b[0]! >= b[2]! || b[1]! >= b[3]!) return problem(400, "invalid_param", 10001, "bbox west,south,east,north", path, mv, "bbox");
        bbox = b as Bbox;
        if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 400) return problem(400, "range_too_large", 40105, "bbox area > 400 deg²", path, mv, "bbox");
      }
      if (aoiId?.startsWith("ADM1_ARG-")) return problem(503, "data_not_loaded", 50502, "argentina adm1 events are not in this snapshot", path, mv);

      /* 범위 판정 */
      const regions: ("KR" | "ARG")[] = bbox ? (["KR", "ARG"] as const).filter((r) => overlaps(bbox!, BOXES[r])) : aoiId && inKr(aoiId) ? ["KR"] : aoiId === "ADM0_ARG" ? ["ARG"] : [];
      const members = aoiId ? s.aoi[aoiId] : null;
      const covered = bbox ? regions.length > 0 : !!aoiId && (inKr(aoiId) || aoiId === "ADM0_ARG");
      const base = { ...(aoiId ? { aoi_id: aoiId } : { bbox: bbox! }), start, end, min_det: minDet, sort: sortQ, notice: NOTICE, data_release: s.release };
      if (!covered) {
        return HttpResponse.json(
          { ...base, count: 0, total: 0, truncated: false, next_cursor: null, events: [], coverage: { available: false, scope: "kr_arg_events", reason: "out_of_coverage", regions: [] } } satisfies S["FireEventList"],
          { headers: headers(mv, s.release) },
        );
      }
      const idx = members ?? s.rows.map((_, i) => i);
      const all = idx
        .map((i) => rowOf(s, s.rows[i]!))
        .filter((e) => e.start_date <= end && e.end_date >= start && e.n_det >= minDet && (!bbox || (e.centroid_lon >= bbox[0] && e.centroid_lon <= bbox[2] && e.centroid_lat >= bbox[1] && e.centroid_lat <= bbox[3])));
      all.sort(SORTS[sortQ]);
      /* 커서 = 다음 자리(불투명 문자열 — 스냅숏 판 + 자리) */
      const cur = q.get("cursor");
      const off = cur && cur.startsWith(`${s.release}:`) ? Number(cur.slice(s.release.length + 1)) || 0 : 0;
      if (cur && !cur.startsWith(`${s.release}:`)) return problem(409, "cursor_stale", 40201, "cursor from another release", path, mv, "cursor");
      const page = all.slice(off, off + limit);
      /* total: 한국은 전부 실었으니 센 값. 아르헨티나는 자른 규칙 안에서만(머리 주석) */
      const hasArg = bbox ? regions.includes("ARG") : aoiId === "ADM0_ARG";
      const ym = wholeMonth(start, end);
      const mc = aoiId === "ADM0_ARG" && ym && (minDet === 1 || minDet === 3) ? (s.month_counts.ADM0_ARG?.[ym]?.[minDet === 1 ? 0 : 1] ?? 0) : null;
      const total = !hasArg || start >= s.slices.ARG.recent_from ? all.length : mc;
      const more = total == null ? true : off + page.length < total;
      return HttpResponse.json(
        {
          ...base,
          count: page.length,
          total,
          truncated: more,
          next_cursor: off + page.length < all.length ? `${s.release}:${off + page.length}` : null,
          events: page,
          coverage: { available: true, scope: "kr_arg_events", reason: null, regions: regions.slice() },
        } satisfies S["FireEventList"],
        { headers: headers(mv, s.release) },
      );
    }),

    http.get(at("/fire-events/:eventId"), async ({ params, request }) => {
      const [s, mv] = await Promise.all([load(), mvOf()]);
      const id = String(params.eventId);
      const path = new URL(request.url).pathname;
      if (!/^(KR|ARG)_\d{8}_\d{4,6}$/.test(id)) return problem(400, "invalid_param", 40002, "event id <region>_<YYYYMMDD>_<serial>", path, mv, "eventId");
      const k = s.cols.indexOf("event_id");
      const r = s.rows.find((x) => x[k] === id);
      if (!r) return problem(404, "not_found", 40402, id.startsWith("ARG_") ? `unknown event ${id} (argentina rows are a slice in this snapshot)` : `unknown event ${id}`, path, mv, "eventId");
      return HttpResponse.json({ event: rowOf(s, r), burned_area_label: "위성 확인 연소 면적(하한)", data_release: s.release } satisfies S["FireEventDetail"], { headers: headers(mv, s.release) });
    }),
  ];
}
