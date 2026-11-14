"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { adm1ShapesQuery, worldGridQuery, worldShapesQuery, type ShapeFeature } from "../api/world-grid";
import { coarseCells, decodeMonth, monthIdx, polysOf, type Polys } from "../lib/coarse";

export interface CoarseAoi {
  aoi_id: string;
  parent_id?: string | null;
  bbox?: number[] | null;
}
export interface CoarseCellsData {
  properties: { cell_size_deg: number; month_status: string; n_cells: number; coarse: true };
  features: { properties: { cell_lat: number; cell_lon: number; value: number; status: string } }[];
}

/**
 * 넓은 범위(/cells 400 range_too_large)의 1° 칸 묶음. on 일 때만 정적 자료를 받는다.
 * 윤곽: WORLD = 전부 · ADM0_ = 나라 윤곽 · CONT_ = 그 대륙에 든 나라(aoi 목록 parent_id) 윤곽 · ADM1_ = 1급 윤곽(없으면 bbox) · 그 밖 = bbox.
 */
export function useCoarseCells(o: { aoiId: string; aois: CoarseAoi[] | null | undefined; y: number; m: number; on: boolean }) {
  const id = o.aoiId;
  const adm0 = /^ADM0_([A-Z]{3})$/.exec(id)?.[1] ?? null;
  const adm1 = /^ADM1_([A-Z]{3})-(.+)$/.exec(id);
  const cont = /^CONT_/.test(id);
  const grid = useQuery({ ...worldGridQuery(), enabled: o.on });
  const shapes = useQuery(worldShapesQuery(o.on && (!!adm0 || cont)));
  const a1 = useQuery(adm1ShapesQuery(adm1?.[1] ?? "KOR", o.on && !!adm1));
  const rec = (o.aois ?? []).find((a) => a.aoi_id === id) ?? null;

  const polys: Polys | null | undefined = useMemo(() => {
    if (id === "WORLD") return null;
    const byIso = (iso: string[], fs: ShapeFeature[]) => fs.filter((f) => f.properties.iso3 && iso.includes(f.properties.iso3)).flatMap((f) => polysOf(f.geometry));
    if (adm0) return shapes.data ? byIso([adm0], shapes.data) : undefined;
    if (cont) {
      if (!shapes.data) return undefined;
      const iso = (o.aois ?? []).filter((a) => a.parent_id === id && /^ADM0_[A-Z]{3}$/.test(a.aoi_id)).map((a) => a.aoi_id.slice(5));
      return byIso(iso, shapes.data);
    }
    if (adm1) {
      if (a1.isPending) return undefined;
      const fc = (a1.data as { geometry?: { features?: { id?: string; properties?: { id?: string }; geometry: { type: string; coordinates: unknown } | null }[] } } | undefined)?.geometry?.features ?? [];
      const want = `${adm1[1]}-${adm1[2]}`;
      return fc.filter((f) => (f.properties?.id ?? f.id) === want).flatMap((f) => polysOf(f.geometry));
    }
    return [];
  }, [id, adm0, cont, adm1, shapes.data, a1.data, a1.isPending, o.aois]);

  const data: CoarseCellsData | null = useMemo(() => {
    if (!o.on || !grid.data || polys === undefined) return null;
    const { meta, buf } = grid.data;
    const i = monthIdx(meta, o.y, o.m);
    const out = i < 0 || i >= meta.months.n;
    const partial = !out && (meta.partial ?? []).some((p) => p.m === i);
    const st = out ? "out_of_range" : partial ? "partial" : "ok";
    const cells = out ? [] : coarseCells(decodeMonth(meta, buf, i), polys, rec?.bbox ?? null);
    return {
      properties: { cell_size_deg: 1, month_status: st, n_cells: cells.length, coarse: true },
      features: cells.map((c) => ({ properties: { ...c, status: st } })),
    };
  }, [o.on, grid.data, polys, o.y, o.m, rec?.bbox]);

  return { data, isPending: o.on && !data && !grid.isError && !shapes.isError, isError: grid.isError || shapes.isError };
}
