/**
 * MSW 처리기 — 실제 백엔드가 오기 전까지 계약(contract/openapi.yaml) 경로를 release 스냅숏 값으로 그대로 응답한다.
 *
 * - 응답 모양 = 계약 모양(snapshot.ts 가 변환). 숫자는 release 값 그대로(A1).
 * - release 에 없는 경로(/hotspots · /cells · /summaries …)는 계약대로 503 data_not_loaded(problem+json).
 * - 기관 연동(ops·land·cmd)·로그인은 여기 없다 — 그쪽은 MSW 가 아니라 포트 뒤 목 어댑터(src/shared/mock/agency · src/shared/mock/auth)다.
 * 실제 백엔드로 바꾸려면 NEXT_PUBLIC_DATA_MODE=http 한 줄(MSW 를 켜지 않음). 이 파일은 고치지 않는다.
 */
import { bypass, http, HttpResponse } from "msw";
import {
  countryAoi,
  countryMonth,
  indexOf,
  koreaAoi,
  koreaComparison,
  koreaMonth,
  type CountriesSnap,
  type KoreaSnap,
} from "./snapshot";
import { occurrenceHandlers } from "./occurrence";
import { createFireEventHandlers } from "./fire-events";
import { createV12FwiSpreadHandlers } from "./v12-fwi-spread";
import { createV12FrsHandlers } from "./v12-frs";

const SNAP = "/data/snap";
let korea: Promise<KoreaSnap> | null = null;
let countries: Promise<CountriesSnap> | null = null;
const load = <T,>(p: string): Promise<T> => fetch(bypass(new Request(new URL(p, location.origin)))).then((r) => r.json() as Promise<T>);
const getKorea = () => (korea ??= load<KoreaSnap>(`${SNAP}/korea.json`));
const getCountries = () => (countries ??= load<CountriesSnap>(`${SNAP}/countries.json`));
/* release m2v_meta.json(실서버 /methods/current 의 meta 와 같은 파일) — 없으면 빈 meta */
let meta: Promise<Record<string, unknown>> | null = null;
const getMeta = () => (meta ??= load<Record<string, unknown>>(`${SNAP}/m2v_meta.json`).catch(() => ({})));

/* 실서버 /methods/current 의 값 출처 표(2026-11-14 :18490 표본과 같은 모양 — from/to 는 달 YYYY-MM, label_ko 는 서버 문구) */
const VALUE_SOURCES = [
  { value_source: "modis_m2v_terra", from: "2000-11", to: "2002-06", label_ko: "추정 (Terra)" },
  { value_source: "modis_m2v", from: "2002-07", to: "2012-01", label_ko: "추정 (MODIS → VIIRS)" },
  { value_source: "snpp_observed", from: "2012-02", to: "2026-10", label_ko: "실측" },
  { value_source: "n20_bridge", from: "2026-11", to: null, label_ko: "실측 (NOAA-20 환산 × 1.013)", factor: 1.013 },
  { value_source: "n21_bridge", from: null, to: null, label_ko: "대체 위성 (NOAA-21 × 1.053, NOAA-20 결측일)", factor: 1.053 },
];
const SOURCES = [
  { url: "https://firms.modaps.eosdis.nasa.gov/", name: "NASA FIRMS", credit: "We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA's Earth Science Data and Information System (ESDIS)." },
  { license: "CC BY", name: "Boundaries", note: "see the team's docs/references.md" },
];

/* 계약 info.x-display-names(F15, 모델팀 v1.2 노트) — 화면 표시 이름만, 값은 내부 id */
const DISPLAY_NAMES = { m2v_xgb: "FireBridge (MODIS-to-VIIRS Harmonizer)", m2v_xgb_terra: "FireBridge-Terra", m2v_q10_q90: "FireBridge Uncertainty Band", n20_bridge: "N20 Bridge" };

let reqN = 0;
const requestId = () => `MSW${(++reqN).toString(36).toUpperCase().padStart(6, "0")}`;

function problem(status: number, code: string, errorNo: number, detail: string, instance: string, mv: string, param?: string) {
  return HttpResponse.json(
    {
      type: `https://emberline.example/errors/${code}`,
      title: code,
      status,
      code,
      error_no: errorNo,
      detail,
      instance,
      request_id: requestId(),
      method_version: mv,
      ...(param ? { param } : {}),
    },
    { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store", "X-Method-Version": mv } },
  );
}

const ok = <T,>(body: T, mv: string) => HttpResponse.json(body as never, { headers: { "X-Method-Version": mv } });

/** base = "/api/v1" 같은 기준 경로(같은 출처). 다른 호스트면 절대 주소 */
export function createHandlers(base: string) {
  const at = (p: string) => `${base.replace(/\/$/, "")}${p}`;

  async function findAoi(id: string) {
    const [k, c] = await Promise.all([getKorea(), getCountries()]);
    const ka = k.aoi.find((a) => a.id === id);
    if (ka) return { kind: "korea" as const, k, c, ka };
    const ca = c.aoi.find((a) => a.id === id);
    if (ca) return { kind: "country" as const, k, c, ca };
    return { kind: "none" as const, k, c };
  }

  return [
    // 다음 달 발생 확률(F15) + 시군구 경계 — 앞에 둔다(경계는 시군구만 답하고 나머지는 아래 503 으로 넘긴다)
    ...occurrenceHandlers(at, () => getKorea().then((k) => k.method_version)),
    /* v1.2 화재 사건(F15) — fire-events.ts */
    ...createFireEventHandlers(base, () => getKorea().then((k) => k.method_version)),
    /* v1.2 새 층: FWI · 확산 nowcast(public/data/snap/v12 — release v1.2 에서 자른 값) */
    ...createV12FwiSpreadHandlers(base, () => getKorea().then((k) => k.method_version)),

    http.get(at("/aois"), async ({ request }) => {
      const [k, c] = await Promise.all([getKorea(), getCountries()]);
      const u = new URL(request.url);
      const level = u.searchParams.get("level");
      const parent = u.searchParams.get("parent_id");
      const q = (u.searchParams.get("q") ?? "").toLowerCase();
      const all = [...k.aoi.map(koreaAoi), ...c.aoi.filter((a) => a.id !== "KR").map(countryAoi)];
      const aois = all.filter(
        (a) =>
          (!level || a.level === level) &&
          (!parent || a.parent_id === parent) &&
          (!q || a.aoi_id.toLowerCase().includes(q) || a.name_ko.toLowerCase().includes(q)),
      );
      return ok({ method_version: k.method_version, count: aois.length, aois }, k.method_version);
    }),

    http.get(at("/aois/:aoiId"), async ({ params, request }) => {
      const id = String(params.aoiId);
      const f = await findAoi(id);
      if (f.kind === "none") return problem(404, "unknown_aoi", 20401, `unknown aoi_id ${id}`, new URL(request.url).pathname, f.k.method_version, "aoiId");
      const aoi = f.kind === "korea" ? koreaAoi(f.ka) : countryAoi(f.ca);
      return ok({ ...aoi, method_version: f.k.method_version }, f.k.method_version);
    }),

    http.get(at("/aois/:aoiId/calendar"), async ({ params, request }) => {
      const id = String(params.aoiId);
      const u = new URL(request.url);
      const f = await findAoi(id);
      const mv = f.k.method_version;
      if (f.kind === "none") return problem(404, "unknown_aoi", 20401, `unknown aoi_id ${id}`, u.pathname, mv, "aoiId");
      const sy = Number(u.searchParams.get("start_year") ?? 2000);
      const ey = Number(u.searchParams.get("end_year") ?? 2026);
      if (!Number.isInteger(sy) || !Number.isInteger(ey) || sy > ey) return problem(400, "invalid_param", 10001, "start_year/end_year", u.pathname, mv, "start_year");
      if (ey - sy > 40) return problem(400, "range_too_large", 30101, "end_year - start_year > 40", u.pathname, mv, "end_year");
      const start = f.k.months.start;
      const n = f.k.months.n;
      const months = [];
      for (let y = sy; y <= ey; y++) {
        for (let m = 1; m <= 12; m++) {
          const i = indexOf(start, y, m);
          if (i < 0 || i >= n) {
            // 파일에 행이 없는 달: 계약대로 out_of_range, 값 null
            months.push({ year: y, month: m, value: null, value_lo: null, value_hi: null, raw_modis: null, raw_viirs: null, value_source: null, data_source: null, status: "out_of_range" as const, verdict: null, percentile: null, ratio_to_median: null, low_sample: null });
          } else months.push(f.kind === "korea" ? koreaMonth(f.k, f.ka, i) : countryMonth(f.c, f.ca, i));
        }
      }
      return ok({ aoi_id: id, method_version: mv, unit: "VIIRS(S-NPP) 기준 화재 감지량", start_year: sy, end_year: ey, months }, mv);
    }),

    http.get(at("/aois/:aoiId/months/:yearMonth/comparison"), async ({ params, request }) => {
      const id = String(params.aoiId);
      const ym = String(params.yearMonth);
      const u = new URL(request.url);
      const f = await findAoi(id);
      const mv = f.k.method_version;
      if (f.kind === "none") return problem(404, "unknown_aoi", 20401, `unknown aoi_id ${id}`, u.pathname, mv, "aoiId");
      const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
      if (!m) return problem(400, "invalid_param", 10001, "yearMonth must be YYYY-MM", u.pathname, mv, "yearMonth");
      if (f.kind !== "korea") return problem(503, "data_not_loaded", 50501, "comparison detail is in the snapshot for Korean AOIs only", u.pathname, mv);
      const i = indexOf(f.k.months.start, Number(m[1]), Number(m[2]));
      if (i < 0 || i >= f.k.months.n) return problem(404, "not_found", 80401, "month out of release range", u.pathname, mv, "yearMonth");
      return ok(koreaComparison(f.k, f.ka, i), mv);
    }),

    http.get(at("/methods/current"), async () => {
      const [k, m] = await Promise.all([getKorea(), getMeta()]);
      return ok(
        {
          method_version: k.method_version,
          unit: "VIIRS(S-NPP) 기준 화재 감지량",
          unit_code: "snpp_equiv_hotspots",
          meta: { ...m, method_version: k.method_version },
          value_sources: VALUE_SOURCES,
          statuses: ["ok", "nrt", "partial", "missing", "out_of_range"],
          sources: SOURCES,
          data_version: k.release,
          /* v1.2 표시 이름·성능 문구(계약 Method.display_names · performance_copy = info.x-display-names) */
          display_names: DISPLAY_NAMES,
          performance_copy: "총량 오차 1~2%, 월별 상관 0.97",
          /* 이 스냅숏에 든 파일(실서버 files 와 같은 이름) — 점(hotspots)은 없음, 위성 일 상태는 v1.2 스냅숏(public/data/snap/v12)에 있음 */
          files: { hotspots: false, satellite_day_status: true },
        },
        k.method_version,
      );
    }),

    http.get(at("/version"), async () => {
      const k = await getKorea();
      return ok({ api_version: "v1", method_version: k.method_version, data_version: k.release, release: k.release, limits: { calendar_years: 40 } }, k.method_version);
    }),

    /* v1.2 불 유형 배지 · 불 세기 FRP · 위성 상태 — release v1.2 에서 자른 스냅숏(v12-frs.ts) */
    ...createV12FrsHandlers(at, {
      problem,
      ok,
      methodVersion: async () => (await getKorea()).method_version,
      known: async (id) => (await findAoi(id)).kind !== "none",
    }),

    // release 에 없는 자료: 계약대로 503 data_not_loaded
    ...["/hotspots", "/cells", "/summaries", "/aois/:aoiId/summary", "/aois/:aoiId/boundary"].map((p) =>
      http.get(at(p), async ({ request }) => {
        const k = await getKorea();
        return problem(503, "data_not_loaded", 50501, "not provided by this snapshot", new URL(request.url).pathname, k.method_version);
      }),
    ),
  ];
}
