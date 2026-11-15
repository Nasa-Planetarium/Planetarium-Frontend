/**
 * MSW 처리기 — 다음 달 발생 확률(F15, 계약 contract/openapi.yaml tags: outlook) + 시군구 경계.
 *
 * 값 = public/data/snap/occurrence.json · kr-sgg-boundary.json (scripts/snap-occurrence.py 가 release data-v1.2-2026-11-15 파일에서 잘라 만든 것).
 * 확률은 파일 값(×1e5 정수 → 소수 5자리, fields=map 은 4자리 — 계약 설명 그대로). vs_normal·grid_summary 는 스크립트가 계약 규칙으로 붙여 둔 값.
 * 실제 백엔드(DATA_MODE=http)에서는 이 파일이 빠진다. 화면은 이 파일을 import 하지 않는다.
 */
import { bypass, http, HttpResponse } from "msw";

interface OccSnap {
  release: string;
  target_month: string;
  as_of_date: string;
  model_grid: string;
  model_aoi: string;
  grid: {
    n: number;
    id: number[];
    p: number[];
    pn: number[];
    b: number[];
    vs: number[];
    ps: number[];
    a0: number[];
    ct: number[];
    r5: (number | null)[];
    l1: (number | null)[];
    codes: { vs: string[]; adm0: string[]; continent: string[] };
  };
  aoi: { id: string; name: string | null; parent: string | null; p: number; pn: number; b: number; vs: number; ind: boolean; r5: number | null; ny: number | null; l1: boolean | null }[];
  summary: Record<string, [number, number, number, number, number, number, number | null, number | null, number[]]>;
}
interface BndSnap {
  geometry: Record<string, unknown>;
}

const SNAP = "/data/snap";
const load = <T,>(p: string): Promise<T> => fetch(bypass(new Request(new URL(p, location.origin)))).then((r) => r.json() as Promise<T>);
let occ: Promise<OccSnap> | null = null;
let bnd: Promise<BndSnap> | null = null;
const getOcc = () => (occ ??= load<OccSnap>(`${SNAP}/occurrence.json`));
const getBnd = () => (bnd ??= load<BndSnap>(`${SNAP}/kr-sgg-boundary.json`));

const NOTICE = "과거 감지 기록과 최근 활동으로 본 확률입니다. 날씨 예보가 아닙니다. 회색 격자는 공장·가스 플레어 같은 지속 열원 의심 지역입니다.";
const NOTICE_AOI = "과거 감지 기록과 최근 활동으로 본 확률입니다. 날씨 예보가 아니며, 공장 등 산업 열원으로 보이는 감지가 일부 섞여 있을 수 있습니다.";
const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const q = (i: number | null, d = 5) => (i == null ? null : r(i / 1e5, d));
/** 0.5° 격자 id → 칸 중심(계약 GridOccurrenceCell.cell_id 식) */
export const cellCenter = (id: number) => ({ lat: -90 + Math.floor(id / 720) * 0.5 + 0.25, lon: -180 + (id % 720) * 0.5 + 0.25 });

function cellAt(s: OccSnap, i: number, full: boolean) {
  const g = s.grid;
  const id = g.id[i]!;
  const c = cellCenter(id);
  const d = full ? 5 : 4;
  const base = { cell_id: id, lat: c.lat, lon: c.lon, p_any: q(g.p[i]!, d)!, baseline_p: q(g.b[i]!, d)!, vs_normal: g.codes.vs[g.vs[i]!]!, persistent_source: g.ps[i] === 1 };
  if (!full) return base;
  const a0 = g.a0[i]!;
  const ct = g.ct[i]!;
  return { ...base, p_none: q(g.pn[i]!)!, adm0: a0 < 0 ? null : g.codes.adm0[a0]!, continent: ct < 0 ? null : g.codes.continent[ct]!, rate_5y: q(g.r5[i] ?? null), lag1_projected: g.l1[i] == null ? null : g.l1[i] === 1 };
}

const headers = (s: OccSnap) => ({ "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate", ETag: `"${s.release}"` });

function aoiItem(s: OccSnap, a: OccSnap["aoi"][number], rank: number | null) {
  return {
    aoi_id: a.id,
    name_ko: a.name,
    unit: "aoi" as const,
    target_month: s.target_month,
    as_of_date: s.as_of_date,
    model: s.model_aoi,
    p_any: q(a.p),
    p_none: q(a.pn),
    baseline_p: q(a.b),
    vs_normal: s.grid.codes.vs[a.vs] ?? null,
    suspected_industrial: a.ind,
    rank,
    rate_5y: a.r5,
    n_years: a.ny,
    lag1_projected: a.l1,
    grid_summary: null,
    coverage: { available: true, scope: "kr_sgg", reason: null },
    notice: NOTICE_AOI,
    data_release: s.release,
  };
}

export function occurrenceHandlers(at: (p: string) => string, methodVersion: () => Promise<string>) {
  return [
    http.get(at("/occurrence/grid"), async ({ request }) => {
      const s = await getOcc();
      const u = new URL(request.url);
      const full = (u.searchParams.get("fields") ?? "full") !== "map";
      const minP = Number(u.searchParams.get("min_p_any") ?? 0) || 0;
      const bb = (u.searchParams.get("bbox") ?? "").split(",").map(Number);
      const box = bb.length === 4 && bb.every(Number.isFinite) ? (bb as [number, number, number, number]) : null;
      const cells = [];
      for (let i = 0; i < s.grid.n; i++) {
        if (s.grid.p[i]! / 1e5 < minP) continue;
        if (box) {
          const c = cellCenter(s.grid.id[i]!);
          if (c.lon < box[0] || c.lat < box[1] || c.lon > box[2] || c.lat > box[3]) continue;
        }
        cells.push(cellAt(s, i, full));
      }
      return HttpResponse.json(
        {
          target_month: s.target_month,
          as_of_date: s.as_of_date,
          model: s.model_grid,
          cell_size_deg: 0.5,
          ...(box ? { bbox: box } : {}),
          count: cells.length,
          cells,
          coverage: { available: true, scope: "world_land_detected", reason: null },
          notice: NOTICE,
          data_release: s.release,
        },
        { headers: headers(s) },
      );
    }),

    http.get(at("/occurrence/aois"), async ({ request }) => {
      const s = await getOcc();
      const parent = new URL(request.url).searchParams.get("parent_id") ?? "";
      const ok = parent === "KR" || /^SIDO_\d+$/.test(parent);
      const rows = ok ? s.aoi.filter((a) => parent === "KR" || a.parent === parent) : [];
      /* 순위: 산업 열원 의심이 아닌 행만 p_any 내림차순(계약) */
      const ranked = rows.filter((a) => !a.ind).sort((x, y) => y.p - x.p);
      const rk = new Map(ranked.map((a, i) => [a.id, i + 1]));
      const items = rows
        .slice()
        .sort((x, y) => (rk.get(x.id) ?? 1e9) - (rk.get(y.id) ?? 1e9) || y.p - x.p)
        .map((a) => aoiItem(s, a, rk.get(a.id) ?? null));
      return HttpResponse.json(
        {
          parent_id: parent,
          target_month: s.target_month,
          as_of_date: s.as_of_date,
          count: items.length,
          items,
          coverage: ok && items.length ? { available: true, scope: "kr_sgg", reason: null } : { available: false, scope: "kr_sgg", reason: "out_of_coverage" },
          notice: NOTICE_AOI,
          data_release: s.release,
        },
        { headers: headers(s) },
      );
    }),

    http.get(at("/aois/:aoiId/occurrence"), async ({ params }) => {
      const s = await getOcc();
      const id = String(params.aoiId);
      const a = s.aoi.find((x) => x.id === id);
      if (a) return HttpResponse.json(aoiItem(s, a, null), { headers: headers(s) });
      const sm = s.summary[id];
      const has = !!sm && sm[0] > 0;
      const ix = new Map(s.grid.id.map((c, i) => [c, i]));
      return HttpResponse.json(
        {
          aoi_id: id,
          name_ko: null,
          unit: "grid_summary",
          target_month: s.target_month,
          as_of_date: s.as_of_date,
          model: s.model_grid,
          p_any: null,
          p_none: null,
          baseline_p: null,
          vs_normal: null,
          suspected_industrial: null,
          rate_5y: null,
          n_years: null,
          lag1_projected: null,
          grid_summary: has
            ? {
                n_cells: sm[0],
                n_persistent: sm[1],
                bands: { lt10: sm[2], p10_40: sm[3], p40_70: sm[4], ge70: sm[5] },
                p_any_max: q(sm[6]),
                p_any_median: q(sm[7]),
                top_cells: sm[8].map((c) => cellAt(s, ix.get(c)!, false)),
              }
            : null,
          coverage: has ? { available: true, scope: "world_land_detected", reason: null } : { available: false, scope: "world_land_detected", reason: "no_cells" },
          notice: NOTICE,
          data_release: s.release,
        },
        { headers: headers(s) },
      );
    }),

    /* 시군구 경계만 — 그 밖 AOI 는 아무것도 돌려주지 않아 다음 처리기(503 data_not_loaded)로 넘어간다 */
    http.get(at("/aois/:aoiId/boundary"), async ({ params }) => {
      const id = String(params.aoiId);
      if (!/^SGG_\d+$/.test(id)) return undefined;
      const [b, mv] = await Promise.all([getBnd(), methodVersion()]);
      const geometry = b.geometry[id];
      if (!geometry) return undefined;
      return HttpResponse.json({ type: "Feature", geometry, properties: { aoi_id: id, method_version: mv } } as never, { headers: { "Content-Type": "application/geo+json" } });
    }),
  ];
}
