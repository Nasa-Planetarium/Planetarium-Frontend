"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { boundaryQuery, type CountryInfo } from "@/entities/country";
import { polysOf, worldShapesQuery } from "@/entities/world-grid";
import { iso3OfAdm0 } from "@/shared/lib/adm0";
import type { AoiRec } from "../api/queries";
import type { LandPart, Ring } from "../model/cell-frame";
import { iso3OfAoi } from "../model/core";
import { regionMatcher, thin, type Boundary } from "./s1-side";

/** 칸 지도 바탕 땅의 나라: KR·시도·시군구 = KOR, ADM0_<코드> = 그 나라, ADM1_<코드>-… = 그 나라. WORLD·대륙 = null(세계 윤곽) */
export function landIso3(aoi: string): string | null {
  const a0 = iso3OfAoi(aoi);
  if (a0) return a0;
  const a1 = /^ADM1_([A-Z]{3})-/.exec(aoi)?.[1];
  return a1 ? iso3OfAdm0(a1) : null;
}

/**
 * 칸 지도 바탕 땅(ui/charts.tsx CellDots land) — 지금 나라 1급 경계(public/geo/c/<ISO3>.json, 미리보기와 같은 파일·같은 Query 키)
 * + 고른 1급 강조(regionMatcher). WORLD·대륙은 세계 윤곽(public/geo/world.json). 파일이 아직 없으면 빈 배열(바다 바탕만).
 */
export function useCellLand(o: { aoi: string; rec: AoiRec | null; parent: AoiRec | null; countries: CountryInfo[] }) {
  const iso3 = landIso3(o.aoi);
  const world = !iso3 && !!o.aoi && (o.aoi === "WORLD" || /^CONT_/.test(o.aoi));
  const bq = useQuery({ ...boundaryQuery(iso3 ?? ""), enabled: !!iso3 });
  const wq = useQuery(worldShapesQuery(world));
  const info = iso3 ? o.countries.find((c) => c.iso3 === iso3) : undefined;
  const land: LandPart[] = useMemo(() => {
    if (iso3) {
      const b = (bq.data ?? null) as Boundary | null;
      if (!b?.regions?.length) return [];
      const geo = new Map(b.geometry.features.map((f) => [f.id, f.geometry] as const));
      const on = regionMatcher(iso3, o.aoi, o.rec, o.parent);
      return b.regions.map((r) => {
        const g = geo.get(r.id);
        const polys = !g ? [] : g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
        const rings: Ring[] = polys.map((p) => thin((p[0] ?? []).map(([x, y]) => [x as number, y as number] as [number, number])));
        return { rings, on: on(r), title: r.name_ko ?? r.name_en };
      });
    }
    if (world && wq.data) return wq.data.map((f) => ({ rings: polysOf(f.geometry).map((p) => thin((p[0] ?? []).map(([x, y]) => [x as number, y as number] as [number, number]))) }));
    return [];
  }, [iso3, world, bq.data, wq.data, o.aoi, o.rec, o.parent]);
  return { land, c0: info ? info.c[0] : null, ready: iso3 ? !bq.isPending : world ? !wq.isPending : true };
}
