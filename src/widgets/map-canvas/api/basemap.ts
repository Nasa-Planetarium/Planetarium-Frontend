import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import type { DemManifest, GeoCollection, Geom, MapRegion } from "../model/types";
import { labelPoint } from "../lib/geo";

/**
 * 바탕 자료 읽기(정적 파일 — 계약 API 아님). 파일이 없으면(404) null 로 받아 지도는 그 층 없이 그린다.
 *  - public/dem/manifest.json      지형 DEM 타일 목록(W0 바탕 자료). 없으면 음영 없음 + 출처 줄에 지형을 적지 않는다
 *  - public/geo/lines/<ISO3>.json  하천·도로 선(FeatureCollection, properties.kind = river|road, name, major?)
 */
async function optionalJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) return null; // 정적 서버가 404 대신 404.html 을 200 으로 줄 때
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const demManifestQuery = () =>
  queryOptions({
    queryKey: ["static", "dem-manifest"] as const,
    queryFn: ({ signal }) => optionalJson<DemManifest>("/dem/manifest.json", signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

export const linesQuery = (iso3: string) =>
  queryOptions({
    queryKey: ["static", "geo-lines", iso3] as const,
    queryFn: ({ signal }) => optionalJson<GeoCollection>(`/geo/lines/${encodeURIComponent(iso3)}.json`, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    enabled: !!iso3,
  });

/* ── 경계 면 ── */
interface Adm1File {
  regions: { id: string; name_ko?: string; name_en?: string; name_local?: string; c?: [number, number] }[];
  geometry: { features: { id?: string; properties?: { id?: string }; geometry: Geom }[] };
}
/** 나라 1급(public/geo/c/<ISO3>.json — entities/country boundaryQuery 와 같은 파일) → 지도 면 */
export const adm1RegionsQuery = (iso3: string, lang: string) =>
  queryOptions({
    queryKey: ["geo", "boundary", iso3, "regions", lang] as const,
    queryFn: async ({ signal }) => {
      const g = await optionalJson<Adm1File>(`/geo/c/${encodeURIComponent(iso3)}.json`, signal);
      if (!g) return [] as MapRegion[];
      const byId = new Map(g.regions.map((r) => [r.id, r]));
      return g.geometry.features.map((f): MapRegion => {
        const id = String(f.properties?.id ?? f.id ?? "");
        const r = byId.get(id);
        const p = r?.c ? ([r.c[1], r.c[0]] as [number, number]) : labelPoint(f.geometry);
        return { id, name: (lang === "ko" ? r?.name_ko : r?.name_en) || r?.name_local || r?.name_en || id, lat: p?.[0] ?? 0, lon: p?.[1] ?? 0, geometry: f.geometry };
      });
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

interface AoiRow {
  aoi_id: string;
  name_ko: string | null;
  name_en: string | null;
  bbox?: number[] | null;
}
/**
 * 실제 API 지역의 아래 단계 면(예 SIDO_47 → 시군구 23개, KR → 시도 17개): /aois?parent_id + /aois/{id}/boundary.
 * MSW(스냅숏)는 경계가 503 이라 빈 목록 — 화면은 나라 1급(adm1RegionsQuery)으로 대신한다.
 */
export const childRegionsQuery = (parentId: string, lang: string, mv: string | null) =>
  queryOptions({
    queryKey: ["map-canvas", "children", parentId, lang, mv] as const,
    queryFn: async ({ signal }) => {
      const rows: AoiRow[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const r = (await api.GET("/aois", { params: { query: { parent_id: parentId, limit: 1000, include_hidden: true, ...(cursor ? { cursor } : {}) } as never }, signal }).then(unwrap)) as unknown as { aois: AoiRow[]; next_cursor?: string | null };
        rows.push(...r.aois);
        if (!r.next_cursor) break;
        cursor = r.next_cursor;
      }
      const out = await Promise.all(
        rows.map(async (a): Promise<MapRegion | null> => {
          try {
            const f = (await api.GET("/aois/{aoiId}/boundary", { params: { path: { aoiId: a.aoi_id } }, signal }).then(unwrap)) as unknown as { geometry: Geom | null };
            const b = a.bbox;
            const p = labelPoint(f.geometry) ?? (b && b.length === 4 ? ([(b[1]! + b[3]!) / 2, (b[0]! + b[2]!) / 2] as [number, number]) : null);
            if (!p) return null;
            return { id: a.aoi_id, name: (lang === "ko" ? a.name_ko : a.name_en) || a.name_ko || a.name_en || a.aoi_id, lat: p[0], lon: p[1], geometry: f.geometry };
          } catch {
            return null;
          }
        }),
      );
      return out.filter((x): x is MapRegion => !!x);
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    enabled: !!parentId && !!mv,
  });

/** 한 지역 윤곽(바깥 가림의 구멍) — /aois/{id}/boundary */
export const focusBoundaryQuery = (aoiId: string | null, mv: string | null) =>
  queryOptions({
    queryKey: ["map-canvas", "focus", aoiId, mv] as const,
    queryFn: async ({ signal }) => {
      const f = (await api.GET("/aois/{aoiId}/boundary", { params: { path: { aoiId: aoiId! } }, signal }).then(unwrap)) as unknown as { geometry: Geom | null };
      return f.geometry;
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    enabled: !!aoiId && !!mv,
  });
