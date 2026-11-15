/**
 * MSW 처리기 — v1.2 새 층 중 불 유형 배지 · 불 세기 FRP · 위성 상태(단위 frp-regime-status).
 *
 * 원천 = public/data/snap/v12/*.json — release data-v1.2-2026-11-15 파일에서 scripts/build-v12-frs-snapshot.py 가 잘라 만든 것(값 그대로).
 * 응답 모양 = 계약(contract/openapi.yaml) FireRegime · CellFrpList · SatelliteStatus.
 * 스냅숏에 없는 범위(FRP 의 bbox 질의·일 단위·스냅숏 밖 달·스냅숏 밖 AOI)는 지어내지 않고 503 data_not_loaded(50502).
 * 실제 백엔드로 바꾸면(NEXT_PUBLIC_DATA_MODE=http) 이 파일은 쓰이지 않는다.
 */
import { bypass, http } from "msw";

const SNAP = "/data/snap/v12";
const REL = "data-v1.2-2026-11-15";
type Arr = (number | null)[];

interface RegimeSnap {
  months: { start: string; n: number };
  codes: string[];
  aoi: Record<string, { name: string; fr: Arr; W: Arr; WL: Arr; sl: Arr; ne: Arr; nl: Arr; te: (string | null)[]; tw: Arr }>;
}
interface FrpSnap {
  months: { from: number; to: number; start: string };
  cells: number[];
  rows: [number, number, number | null, number | null, number | null, number, number][];
  aoi: Record<string, number[]>;
}
interface SatSnap {
  satellites: string[];
  codes: { st: string[]; note: string[]; coverage: string[] };
  day: Record<string, { start: string; st: Arr; n: Arr; rs: Arr; nt: Arr; cv: Arr }>;
  month_fields: string[];
  month: (string | number | null)[][];
  through: string;
}

const load = <T,>(p: string): Promise<T> => fetch(bypass(new Request(new URL(p, location.origin)))).then((r) => r.json() as Promise<T>);
let regime: Promise<RegimeSnap> | null = null;
let frp: Promise<FrpSnap> | null = null;
let sat: Promise<SatSnap> | null = null;
const getRegime = () => (regime ??= load<RegimeSnap>(`${SNAP}/fire-regime.json`));
const getFrp = () => (frp ??= load<FrpSnap>(`${SNAP}/frp-month.json`));
const getSat = () => (sat ??= load<SatSnap>(`${SNAP}/satellite-status.json`));

export interface V12Deps {
  problem: (status: number, code: string, errorNo: number, detail: string, instance: string, mv: string, param?: string) => Response;
  ok: <T>(body: T, mv: string) => Response;
  methodVersion: () => Promise<string>;
  /** 지역 목록에 있는 AOI 인가(없으면 404) */
  known: (id: string) => Promise<boolean>;
}

const YM = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const mIndex = (start: string, y: number, m: number) => y * 12 + (m - 1) - (+start.slice(0, 4) * 12 + (+start.slice(5, 7) - 1));
const ymOf = (start: string, i: number) => {
  const t = +start.slice(0, 4) * 12 + (+start.slice(5, 7) - 1) + i;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** 칸 중심(계약 CellId: 모서리 + 0.05) */
const center = (cellId: number) => ({ lat: Math.round(((Math.floor(cellId / 3600) - 900) / 10 + 0.05) * 100) / 100, lon: Math.round((((cellId % 3600) - 1800) / 10 + 0.05) * 100) / 100 });

export function createV12FrsHandlers(at: (p: string) => string, d: V12Deps) {
  return [
    /* 불 유형 배지 — 범위 밖 AOI 는 200 + months [] + coverage.available=false */
    http.get(at("/aois/:aoiId/fire-regime"), async ({ params, request }) => {
      const id = String(params.aoiId);
      const u = new URL(request.url);
      const [mv, R] = await Promise.all([d.methodVersion(), getRegime()]);
      const s = u.searchParams.get("start");
      const e = u.searchParams.get("end");
      if ((s && !YM.test(s)) || (e && !YM.test(e))) return d.problem(400, "invalid_param", 10001, "start/end must be YYYY-MM", u.pathname, mv, s && !YM.test(s) ? "start" : "end");
      if (s && e && s > e) return d.problem(400, "invalid_param", 10001, "start > end", u.pathname, mv, "start");
      const a = R.aoi[id];
      if (!a) {
        if (!(await d.known(id))) return d.problem(404, "unknown_aoi", 20401, `unknown aoi_id ${id}`, u.pathname, mv, "aoiId");
        return d.ok({ aoi_id: id, name: null, months: [], coverage: { available: false, scope: "kr_arg_regime", reason: "out_of_coverage", regions: ["KR", "ARG"] }, data_release: REL }, mv);
      }
      const months = [];
      for (let i = 0; i < R.months.n; i++) {
        const fr = a.fr[i];
        if (fr == null) continue;
        const { year, month } = ymOf(R.months.start, i);
        const ym = `${year}-${String(month).padStart(2, "0")}`;
        if ((s && ym < s) || (e && ym > e)) continue;
        months.push({ year, month, fire_regime: R.codes[fr], W: a.W[i] ?? null, W_large: a.WL[i] ?? null, share_large: a.sl[i] ?? null, n_events: a.ne[i] ?? null, n_large_events: a.nl[i] ?? null, top_event_id: a.te[i] ?? null, top_event_w: a.tw[i] ?? null });
      }
      return d.ok({ aoi_id: id, name: a.name, months, coverage: { available: true, scope: "kr_arg_regime", reason: null }, data_release: REL }, mv);
    }),

    /* 불 세기 FRP — 스냅숏은 불 유형 AOI 295곳 × FRP_MONTHS 의 칸×월만 */
    http.get(at("/cells/frp"), async ({ request }) => {
      const u = new URL(request.url);
      const [mv, F] = await Promise.all([d.methodVersion(), getFrp()]);
      const aoi = u.searchParams.get("aoi_id");
      const bbox = u.searchParams.get("bbox");
      const s = u.searchParams.get("start") ?? "";
      const e = u.searchParams.get("end") ?? "";
      const freq = u.searchParams.get("freq") ?? "day";
      if (!!aoi === !!bbox) return d.problem(400, "invalid_param", 40003, "exactly one of aoi_id / bbox", u.pathname, mv, "aoi_id");
      const ms = DATE.exec(s);
      const me = DATE.exec(e);
      if (!ms || !me) return d.problem(400, "invalid_param", 10001, "start/end must be YYYY-MM-DD", u.pathname, mv, !ms ? "start" : "end");
      if (s > e) return d.problem(400, "invalid_param", 10001, "start > end", u.pathname, mv, "start");
      if (freq !== "day" && freq !== "month") return d.problem(400, "invalid_param", 10001, "freq must be day|month", u.pathname, mv, "freq");
      const i0 = mIndex(F.months.start, +ms[1]!, +ms[2]!);
      const i1 = mIndex(F.months.start, +me[1]!, +me[2]!);
      if (freq === "day" && (dayMs(e) - dayMs(s)) / 864e5 + 1 > 31) return d.problem(400, "range_too_large", 40104, "freq=day: period > 31 days", u.pathname, mv, "end");
      if (freq === "month" && i1 - i0 + 1 > 24) return d.problem(400, "range_too_large", 40104, "freq=month: period > 24 months", u.pathname, mv, "end");
      if (bbox || freq === "day") return d.problem(503, "data_not_loaded", 50502, "this snapshot has aoi_id × month FRP only", u.pathname, mv);
      if (!(await d.known(aoi as string)) && !F.aoi[aoi as string]) return d.problem(404, "unknown_aoi", 20401, `unknown aoi_id ${aoi}`, u.pathname, mv, "aoi_id");
      const mem = F.aoi[aoi as string];
      if (!mem || i0 < F.months.from || i1 > F.months.to) return d.problem(503, "data_not_loaded", 50502, "outside this snapshot (aoi or months)", u.pathname, mv);
      const set = new Set(mem);
      const cells = F.rows
        .filter((r) => r[1] >= i0 && r[1] <= i1 && set.has(r[0]))
        .map((r) => {
          const cid = F.cells[r[0]] as number;
          const { year, month } = ymOf(F.months.start, r[1]);
          const c = center(cid);
          return { cell_id: cid, cell_lat: c.lat, cell_lon: c.lon, date: `${year}-${String(month).padStart(2, "0")}-01`, frp_sum: r[2], frp_snpp_equiv_sum: r[3], frp_snpp_equiv_max: r[4], n_points: r[5] };
        });
      return d.ok(
        {
          aoi_id: aoi,
          start: s,
          end: e,
          freq,
          count: cells.length,
          cells,
          coverage: { available: true, scope: "world_frp", reason: null },
          notice: "불 세기(FRP, S-NPP 기준). Terra 밤 비율(2.41)은 신뢰가 낮고, 2000~2011 MODIS 는 2012 이후 비율을 쓴 값(가정).",
          data_release: REL,
        },
        mv,
      );
    }),

    /* 위성 상태(일 ≤ 366일 · 월 전부) */
    http.get(at("/satellite-status"), async ({ request }) => {
      const u = new URL(request.url);
      const [mv, S] = await Promise.all([d.methodVersion(), getSat()]);
      const freq = u.searchParams.get("freq") ?? "day";
      if (freq !== "day" && freq !== "month") return d.problem(400, "invalid_param", 10001, "freq must be day|month", u.pathname, mv, "freq");
      const want = (u.searchParams.get("satellite") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      const bad = want.find((w) => !S.satellites.includes(w));
      if (bad) return d.problem(400, "invalid_param", 10001, `unknown satellite ${bad}`, u.pathname, mv, "satellite");
      const sats = want.length ? want : S.satellites;
      let s = u.searchParams.get("start");
      let e = u.searchParams.get("end");
      if ((s && !DATE.test(s)) || (e && !DATE.test(e))) return d.problem(400, "invalid_param", 10001, "start/end must be YYYY-MM-DD", u.pathname, mv, s && !DATE.test(s) ? "start" : "end");
      if (freq === "month") {
        const f = S.month_fields;
        const months = S.month
          .map((r) => Object.fromEntries(f.map((k, i) => [k, r[i] ?? null])) as Record<string, string | number | null>)
          .filter((r) => sats.includes(String(r.satellite)))
          .filter((r) => {
            const ym = `${r.year}-${String(r.month).padStart(2, "0")}`;
            return (!s || ym >= s.slice(0, 7)) && (!e || ym <= e.slice(0, 7));
          });
        return d.ok({ start: s, end: e, freq, through: S.through, days: [], months, method_version: mv, data_release: REL }, mv);
      }
      e ??= S.through;
      s ??= iso(dayMs(e) - 30 * 864e5);
      if (s > e) return d.problem(400, "invalid_param", 10001, "start > end", u.pathname, mv, "start");
      if ((dayMs(e) - dayMs(s)) / 864e5 + 1 > 366) return d.problem(400, "range_too_large", 40107, "freq=day: period > 366 days", u.pathname, mv, "end");
      const days = [];
      for (const name of sats) {
        const t = S.day[name];
        if (!t) continue;
        const b = dayMs(t.start);
        const k0 = Math.max(0, Math.round((dayMs(s) - b) / 864e5));
        const k1 = Math.min(t.st.length - 1, Math.round((dayMs(e) - b) / 864e5));
        for (let k = k0; k <= k1; k++) {
          const st = t.st[k];
          if (st == null) continue;
          const nt = t.nt[k];
          const cv = t.cv[k];
          days.push({ satellite: name, date_utc: iso(b + k * 864e5), status: S.codes.st[st], n_det_global: t.n[k] ?? null, coverage: cv == null ? null : (S.codes.coverage[cv] ?? null), ratio_to_seasonal: t.rs[k] ?? null, note: nt == null ? null : (S.codes.note[nt] ?? null) });
        }
      }
      return d.ok({ start: s, end: e, freq, through: S.through, days, months: [], method_version: mv, data_release: REL }, mv);
    }),
  ];
}
