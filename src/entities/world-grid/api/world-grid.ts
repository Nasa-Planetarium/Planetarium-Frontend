import { queryOptions } from "@tanstack/react-query";

/** 전 세계 1° 월별 자료(정적 public/data/snap/world-1deg) — 계약 API 가 아니라 정적 경로(목·실서버 같음) */
export interface WorldMeta {
  method_version: string;
  months: { start: string; n: number };
  n_active: number;
  bitmap_bytes_per_month: number;
  quant: { lnmin: number; lnmax: number };
  counts: number[];
  total: (number | null)[];
  as_of_date?: string;
  partial?: { m: number; as_of_date: string; total: number; total_projected: number }[];
  world_aoi: { v: (number | null)[]; vs: (number | null)[]; ds: (number | null)[]; st: (number | null)[]; vp?: (number | null)[] };
  codes: { vs: string[]; ds: string[]; st: string[] };
}
export interface LatBand {
  band_south: number[];
  v: ((number | null)[] | null)[];
}
export const worldGridQuery = () =>
  queryOptions({
    queryKey: ["static", "world-1deg"] as const,
    queryFn: async ({ signal }) => {
      const [meta, buf, band] = await Promise.all([
        fetch("/data/snap/world-1deg/meta.json", { signal }).then((r) => r.json() as Promise<WorldMeta>),
        fetch("/data/snap/world-1deg/grid.bin", { signal }).then((r) => r.arrayBuffer()),
        fetch("/data/snap/world-1deg/lat-band.json", { signal }).then((r) => r.json() as Promise<LatBand>),
      ]);
      return { meta, buf, band };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

/** 나라 윤곽(public/geo/world.json · iso3 별 Polygon/MultiPolygon) — 1° 칸을 나라·대륙으로 자를 때 */
export interface ShapeFeature {
  properties: { iso3?: string; id?: string };
  geometry: { type: string; coordinates: unknown } | null;
}
export const worldShapesQuery = (on: boolean) =>
  queryOptions({
    queryKey: ["geo", "world-shapes"] as const,
    queryFn: async ({ signal }) => {
      const r = await fetch("/geo/world.json", { signal });
      if (!r.ok) throw new Error(`world.json ${r.status}`);
      return ((await r.json()) as { features: ShapeFeature[] }).features;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: on,
  });

/** 나라 1급 경계(public/geo/c/<ISO3>.json — entities/country boundaryQuery 와 같은 키·같은 파일) */
export const adm1ShapesQuery = (iso3: string, on: boolean) =>
  queryOptions({
    queryKey: ["geo", "boundary", iso3] as const,
    queryFn: async () => {
      const r = await fetch(`/geo/c/${encodeURIComponent(iso3)}.json`);
      if (!r.ok) throw new Error(`geo/c/${iso3}.json ${r.status}`);
      return (await r.json()) as unknown;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: on,
  });
