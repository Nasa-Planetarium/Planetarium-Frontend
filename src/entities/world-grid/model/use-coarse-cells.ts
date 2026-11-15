"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { iso3OfAdm0 } from "@/shared/lib/adm0";
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

/** 범위 윤곽(1° 칸 자르기용). undefined = 아직 받는 중 · null = 전 세계 · [] = bbox 로만 */
function useCoarsePolys(id: string, aois: CoarseAoi[] | null | undefined, on: boolean) {
  const adm0c = /^ADM0_([A-Z]{3})$/.exec(id)?.[1];
  const adm0 = adm0c ? iso3OfAdm0(adm0c) : null;
  const adm1 = /^ADM1_([A-Z]{3})-(.+)$/.exec(id);
  const cont = /^CONT_/.test(id);
  const shapes = useQuery(worldShapesQuery(on && (!!adm0 || cont)));
  const a1 = useQuery(adm1ShapesQuery(adm1?.[1] ?? "KOR", on && !!adm1));
  const rec = (aois ?? []).find((a) => a.aoi_id === id) ?? null;

  const polys: Polys | null | undefined = useMemo(() => {
    if (id === "WORLD") return null;
    const byIso = (iso: string[], fs: ShapeFeature[]) => fs.filter((f) => f.properties.iso3 && iso.includes(f.properties.iso3)).flatMap((f) => polysOf(f.geometry));
    if (adm0) return shapes.data ? byIso([adm0], shapes.data) : undefined;
    if (cont) {
      if (!shapes.data) return undefined;
      const iso = (aois ?? []).filter((a) => a.parent_id === id && /^ADM0_[A-Z]{3}$/.test(a.aoi_id)).map((a) => iso3OfAdm0(a.aoi_id.slice(5)));
      return byIso(iso, shapes.data);
    }
    if (adm1) {
      if (a1.isPending) return undefined;
      const fc = (a1.data as { geometry?: { features?: { id?: string; properties?: { id?: string }; geometry: { type: string; coordinates: unknown } | null }[] } } | undefined)?.geometry?.features ?? [];
      const want = `${adm1[1]}-${adm1[2]}`;
      return fc.filter((f) => (f.properties?.id ?? f.id) === want).flatMap((f) => polysOf(f.geometry));
    }
    return [];
  }, [id, adm0, cont, adm1, shapes.data, a1.data, a1.isPending, aois]);
  return { polys, bbox: rec?.bbox ?? null, isError: shapes.isError };
}

/**
 * 넓은 범위(/cells 400 range_too_large)의 1° 칸 묶음. on 일 때만 정적 자료를 받는다.
 * 윤곽: WORLD = 전부 · ADM0_ = 나라 윤곽 · CONT_ = 그 대륙에 든 나라(aoi 목록 parent_id) 윤곽 · ADM1_ = 1급 윤곽(없으면 bbox) · 그 밖 = bbox.
 */
export function useCoarseCells(o: { aoiId: string; aois: CoarseAoi[] | null | undefined; y: number; m: number; on: boolean }) {
  const grid = useQuery({ ...worldGridQuery(), enabled: o.on });
  const { polys, bbox, isError: shpErr } = useCoarsePolys(o.aoiId, o.aois, o.on);

  const data: CoarseCellsData | null = useMemo(() => {
    if (!o.on || !grid.data || polys === undefined) return null;
    const { meta, buf } = grid.data;
    const i = monthIdx(meta, o.y, o.m);
    const out = i < 0 || i >= meta.months.n;
    const partial = !out && (meta.partial ?? []).some((p) => p.m === i);
    const st = out ? "out_of_range" : partial ? "partial" : "ok";
    const cells = out ? [] : coarseCells(decodeMonth(meta, buf, i), polys, bbox);
    return {
      properties: { cell_size_deg: 1, month_status: st, n_cells: cells.length, coarse: true },
      features: cells.map((c) => ({ properties: { ...c, status: st } })),
    };
  }, [o.on, grid.data, polys, o.y, o.m, bbox]);

  return { data, isPending: o.on && !data && !grid.isError && !shpErr, isError: grid.isError || shpErr };
}

/**
 * 여러 달 1° 칸 합(역할 화면 지도의 넓은 범위 몫 — 상황판 기간이 걸친 달 · 지휘 통계 고른 해/누적).
 * 값 = 달마다 복원한 1° 칸 값의 합(양자화 값 — 지도 색 단계용, 합계·판정에 쓰지 않는다). 자료 범위 밖 달은 건너뛴다.
 * months 가 비면 빈 목록. 반환 cells 는 공통 지도 MapCell 모양(중심 · 크기 1°).
 */
export function useCoarseSum(o: { aoiId: string; aois: CoarseAoi[] | null | undefined; months: readonly (readonly [number, number])[]; on: boolean }) {
  const grid = useQuery({ ...worldGridQuery(), enabled: o.on });
  const { polys, bbox, isError: shpErr } = useCoarsePolys(o.aoiId, o.aois, o.on);
  const mKey = o.months.map((x) => x.join("-")).join(",");
  const cells = useMemo(() => {
    if (!o.on || !grid.data || polys === undefined) return null;
    const { meta, buf } = grid.data;
    const acc = new Map<number, number>();
    let n = 0;
    mKey
      .split(",")
      .filter(Boolean)
      .forEach((k) => {
        const [y, m] = k.split("-").map(Number) as [number, number];
        const i = monthIdx(meta, y, m);
        if (i < 0 || i >= meta.months.n) return;
        n++;
        decodeMonth(meta, buf, i).forEach(({ g, v }) => acc.set(g, (acc.get(g) ?? 0) + v));
      });
    const merged = [...acc.entries()].map(([g, v]) => ({ g, v }));
    return { months: n, cells: coarseCells(merged, polys, bbox).map((c) => ({ lat: c.cell_lat, lon: c.cell_lon, size: 1, value: c.value, months: Math.max(1, n) })) };
  }, [o.on, grid.data, polys, bbox, mKey]);
  return { data: cells, isPending: o.on && !cells && !grid.isError && !shpErr, isError: grid.isError || shpErr };
}
