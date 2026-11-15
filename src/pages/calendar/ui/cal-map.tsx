"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { boundaryQuery } from "@/entities/country";
import { decodeMonth, monthIdx, worldGridQuery, type CoarseAoi } from "@/entities/world-grid";
import { ApiError, cellsTileQuery, pointsBoxQuery } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { areaOf, boxHits, displayInterval, hasSpread, levelOf, LEVEL_KEY, pointBoxes, TAIL_KEY, tilesOf, type Box, type Level, type MapStatusKind } from "@/shared/lib/display";
import { boundaryApiQuery, type MonthPoints } from "../api/queries";
import type { CalView, CellProps } from "../model/calendar";
import { caseFor, cellCase, fmtNum, fmtVal, iso3OfAoi, monthIndex, ymIso, ymWord } from "../model/calendar";
import { unitWord } from "./cal-grid";
import { cx } from "./cx";
import { DotMap, type DotCell } from "./dot-map";
import { WorldReplay } from "./world-replay";

/**
 * M 그 달 지도(목업 drawMap): 전 세계 = 재생 층을 그 달에 멈춘 상태 · 그 밖 = 점(원) 지도.
 * 표시 규칙서(2026-11-15): 무엇을 그릴지는 나라가 아니라 지금 보이는 시야 넓이 하나로 고른다(R1) —
 *   L1(> 100 제곱도) 1° 칸(정적 world-1deg) · L2(≤ 100) 0.1° 칸(/cells?bbox 2.5° 타일) · L3(≤ 4) 감지 점(/hotspots?bbox).
 * 칸·점은 고른 지역 id 가 아니라 시야로 받고(R2), 고른 지역은 첫 시야와 가림막만 정한다.
 * 윤곽 = /aois/{id}/boundary(계약). 목(MSW)은 경계·칸·점이 503 이라 한국 밖은 셸이 이미 받은 나라 1급 경계(geo/c)로, 한국은 윤곽 없이 그린다.
 */
type View = { box: Box; zoom: number };

export function CalMap(o: { aoi: string; aois?: CoarseAoi[] | null; y: number; m: number; view: CalView; mv: string | null; inGb: boolean; onCountry: (iso3: string, i: number) => void; onWorldMonth: (i: number) => void }) {
  const t = useT();
  const lang = useLocale();
  const ym = ymIso(o.y, o.m);
  const world = o.aoi === "WORLD";
  const [view, setView] = useState<View | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  /* 시야가 바뀌면 단계를 다시 고른다(여유는 경계 아래쪽만). 캘린더 지도에는 화소 사각형 층이 없어 L4 는 점(L3)으로 */
  const onView = useCallback((box: Box, zoom: number) => {
    setView({ box, zoom });
    setLevel((prev) => {
      const lv = levelOf(areaOf(box), zoom, prev);
      return lv === "fixed" ? prev : lv === "L4" ? "L3" : lv;
    });
  }, []);

  /* L1: 정적 1° 묶음의 그 달 — 시야와 겹치는 칸만 */
  const grid = useQuery({ ...worldGridQuery(), enabled: !world && level === "L1" });
  const l1 = useMemo(() => {
    if (level !== "L1" || !grid.data || !view) return null;
    const { meta, buf } = grid.data;
    const i = monthIdx(meta, o.y, o.m);
    if (i < 0 || i >= meta.months.n) return { cells: [] as { lat: number; lon: number; p: CellProps }[], st: "out_of_range", asOf: null as string | null, mv: meta.method_version };
    const part = (meta.partial ?? []).find((p) => p.m === i) ?? null;
    const cells = decodeMonth(meta, buf, i).flatMap(({ g, v }) => {
      const la0 = Math.floor(g / 360) - 90;
      const lo0 = (g % 360) - 180;
      if (!boxHits([lo0, la0, lo0 + 1, la0 + 1], view.box)) return [];
      return [{ lat: la0 + 0.5, lon: lo0 + 0.5, p: { cell_lat: la0 + 0.5, cell_lon: lo0 + 0.5, value: Math.round(v * 10) / 10, status: part ? "partial" : "ok" } as CellProps }];
    });
    return { cells, st: part ? "partial" : "ok", asOf: part?.as_of_date ?? null, mv: meta.method_version };
  }, [level, grid.data, view, o.y, o.m]);

  /* L2: 0.1° 칸 2.5° 타일 */
  const tiles = !world && level === "L2" && view ? tilesOf(view.box) : [];
  const tq = useQueries({ queries: tiles.map((tl) => cellsTileQuery(tl, ym, o.mv)) });
  const tKey = tq.map((q) => q.dataUpdatedAt).join(",");
  const l2 = useMemo(() => {
    if (level !== "L2") return null;
    const seen = new Set<string>();
    const cells: { lat: number; lon: number; p: CellProps }[] = [];
    let st = "ok";
    let mv: string | null = null;
    tq.forEach((q) => {
      if (!q.data) return;
      mv = q.data.method_version ?? mv;
      if (q.data.month_status !== "ok") st = q.data.month_status;
      q.data.cells.forEach((p) => {
        if (p.cell_lat == null || p.cell_lon == null) return;
        const key = `${p.cell_lat.toFixed(2)},${p.cell_lon.toFixed(2)}`;
        if (seen.has(key)) return;
        seen.add(key);
        cells.push({ lat: p.cell_lat, lon: p.cell_lon, p: p as CellProps });
      });
    });
    return { cells, st, mv };
    // tq 는 매번 새 배열 — dataUpdatedAt 묶음으로 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, tKey]);

  /* L3: 그 달 감지 점(0.1° 격자 상자, 날짜 변경선은 둘로) */
  const yy = o.y;
  const mm = o.m;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const d0 = `${ym}-01`;
  const d1 = `${ym}-${String(last).padStart(2, "0")}`;
  const boxes = !world && level === "L3" && view ? pointBoxes(view.box) : [];
  const pq = useQueries({ queries: boxes.map((b) => pointsBoxQuery(b, d0, d1, o.mv)) });
  const pKey = pq.map((q) => q.dataUpdatedAt).join(",");
  const pts: MonthPoints | null = useMemo(() => {
    if (level !== "L3" || !pq.length || pq.some((q) => !q.data)) return null;
    const t0 = Date.parse(`${d0}T00:00:00Z`) - 9 * 3600e3;
    const k: MonthPoints = { id: `v-${ym}`, ym, d0, d1, t0, n: 0, la: [], lo: [], t: [], frp: [], ref: [], sat: [], st: [], note: null, truncated: false };
    pq.forEach((q) => {
      q.data?.points.forEach((p) => {
        k.la.push(p.lat);
        k.lo.push(p.lon);
        k.t.push(Math.round((Date.parse(p.at) - t0) / 60000));
        k.frp.push(p.frp == null ? -1 : p.frp);
        k.ref.push(p.ref ? 1 : 0);
        k.sat.push(p.sat);
        k.st?.push(p.stat ? 1 : 0);
      });
      k.note = q.data?.note ?? k.note;
      k.truncated = k.truncated || !!q.data?.truncated;
      if (q.data?.total != null) k.total = (k.total ?? 0) + q.data.total;
    });
    k.n = k.la.length;
    return k;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, pKey, ym]);

  /* 그리고 세는 점은 지금 시야 안의 것만 — 0.1° 격자로 넓힌 받기 상자에만 든 점(이웃 나라 해안 등)을 「이 범위」 개수에 넣지 않는다.
     (싱가포르 2025-03 실서버: 받은 8개가 모두 시야 밖이라 지도는 비었는데 범례는 「감지 점 8개」였다) */
  const ptsIn: MonthPoints | null = useMemo(() => {
    if (!pts || !view) return pts;
    const keep = pts.la.map((la, i) => boxHits([pts.lo[i] as number, la, pts.lo[i] as number, la], view.box));
    if (keep.every(Boolean)) return pts;
    const pick = <T,>(a: T[]) => a.filter((_, i) => keep[i]);
    const k: MonthPoints = { ...pts, la: pick(pts.la), lo: pick(pts.lo), t: pick(pts.t), frp: pick(pts.frp), ref: pick(pts.ref), sat: pick(pts.sat), st: pts.st ? pick(pts.st) : pts.st };
    k.n = k.la.length;
    return k;
  }, [pts, view]);

  /* 그리는 칸: 받는 동안에는 앞 칸을 둔다(끌기에 지도가 비지 않게) */
  const unit = unitWord(t, o.view);
  const src = level === "L1" ? l1 : level === "L2" ? l2 : null;
  const size = level === "L1" ? 1 : 0.1;
  const fresh = useMemo(
    () =>
      (src?.cells ?? []).flatMap(({ lat, lon, p }) => {
        /* 2.5° 타일에서 시야 밖 칸은 그리지도 세지도 않는다(L1 과 같이 — 「이 범위」 개수 · 감지 0 상태 줄이 시야 기준) */
        if (level === "L2" && view && !boxHits([lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05], view.box)) return [];
        const k = cellCase(p, o.view, o.y, o.m);
        if (k.value == null || k.value <= 0) return [];
        /* 구간 표시는 F16 규칙 하나(PR #18 displayInterval) */
        const iv = displayInterval(k.value, k.lo, k.hi);
        return [
          {
            lon,
            lat,
            value: k.value,
            io: k.io,
            valueText: fmtVal(lang, k.value),
            extra: [unit, hasSpread(iv) ? `${t("calendar.k.interval")} ${fmtVal(lang, iv.lo)} – ${fmtVal(lang, iv.hi)}` : "", k.io ? t("calendar.flag.interval_out") : "", k.status && k.status !== "ok" ? t(`shell.st.${k.status}`) : ""]
              .filter(Boolean)
              .join(" · "),
          },
        ];
      }),
    [src, o.view, o.y, o.m, lang, unit, t, level, view],
  );
  const pendingCells = (level === "L1" && grid.isPending) || (level === "L2" && tq.some((q) => q.isPending));
  const [kept, setKept] = useState<{ cells: (DotCell & { io: boolean })[]; size: number }>({ cells: [], size: 0.1 });
  if (!pendingCells && src && (kept.cells !== fresh || kept.size !== size) && level !== "L3") setKept({ cells: fresh, size });
  const cells = level === "L3" ? [] : kept.cells;

  const bq = useQuery(boundaryApiQuery(o.aoi, o.mv, !world));
  const iso3 = iso3OfAoi(o.aoi);
  const geoQ = useQuery({ ...boundaryQuery(iso3 ?? "KOR"), enabled: !world && bq.isError && !!iso3 && iso3 !== "KOR" });
  const sel = world ? null : caseFor(ym, o.aoi, o.inGb);
  const outlines = useMemo(() => {
    if (bq.data) return bq.data;
    const g = geoQ.data as { geometry?: { features?: { geometry?: { type: string; coordinates: unknown } }[] } } | undefined;
    const fs = g?.geometry?.features ?? [];
    const thin = (ring: number[][]) => (ring.length > 200 ? ring.filter((_, i) => i % Math.ceil(ring.length / 200) === 0) : ring);
    const rings = fs.flatMap((f) => {
      const gg = f.geometry;
      if (!gg) return [];
      const polys = (gg.type === "Polygon" ? [gg.coordinates] : gg.type === "MultiPolygon" ? gg.coordinates : []) as number[][][][];
      return polys.map((p) => thin(p[0] ?? []));
    });
    /* 날짜 변경선을 넘는 나라: 윤곽 범위가 반구를 넘으면 윤곽 없이 */
    let w = 999;
    let e = -999;
    rings.forEach((r) => r.forEach((q) => ((w = Math.min(w, q[0] as number)), (e = Math.max(e, q[0] as number)))));
    return e - w > 180 ? [] : rings;
  }, [bq.data, geoQ.data]);

  if (world)
    return (
      <div className={cx("cl-map is-wf")}>
        <WorldReplay mv={o.mv} month={monthIndex(o.y, o.m)} partialLine={(p) => t("calendar.ui.partial_line", p)} onCountry={o.onCountry} onMonth={o.onWorldMonth} />
      </div>
    );

  /* 상태 줄 하나(R11) + 꼬리(진행 중 · NRT, R14) */
  const errOf = (e: unknown): MapStatusKind => (e instanceof ApiError && e.code === "data_not_loaded" ? "no_data" : "error");
  const err = level === "L1" ? (grid.error ?? null) : level === "L2" ? (tq.find((q) => q.error)?.error ?? null) : level === "L3" ? (pq.find((q) => q.error)?.error ?? null) : null;
  const pendingPts = level === "L3" && pq.some((q) => q.isPending);
  /* 판 대조(R14): 1° 묶음과 같은 시야에서 받은 0.1° 칸의 method_version 이 다르면 1° 를 그리지 않는다 */
  const tileMv = tq.find((q) => q.data?.method_version)?.data?.method_version ?? null;
  const mismatch = level === "L1" && !!l1?.mv && !!tileMv && l1.mv !== tileMv;
  const nDrawn = level === "L3" ? (ptsIn?.st ? ptsIn.st.filter((x) => !x).length : (ptsIn?.n ?? 0)) : cells.length;
  const kind: MapStatusKind | null = !level || pendingCells || pendingPts ? "loading" : mismatch ? "mismatch" : err ? errOf(err) : nDrawn === 0 ? "empty" : null;
  const st = src?.st ?? "ok";
  const tailKey = TAIL_KEY[st];
  const asOf = level === "L1" ? (l1?.asOf ?? null) : null;
  const tail = tailKey ? (st === "partial" && asOf ? t(tailKey, { at: asOf }) : t(st === "partial" ? "map.status.partial0" : tailKey)) : null;
  const hint = level ? (level === "L3" && pts?.truncated ? t("map.level.L3_cut", { n: fmtNum(lang, pts.total ?? pts.n), m: fmtNum(lang, pts.n) }) : t(LEVEL_KEY[level], { n: fmtNum(lang, nDrawn) })) : null;
  const nIo = cells.filter((c) => c.io).length;

  return (
    <>
      <div className={cx("cl-map")} data-map="" data-level={level ?? ""} data-area={view ? areaOf(view.box).toFixed(2) : ""} data-cells={level && level !== "L3" && !pendingCells ? String(cells.length) : ""}>
        <DotMap
          cells={mismatch ? [] : cells}
          size={kept.size}
          outlines={outlines}
          pts={level === "L3" ? ptsIn : null}
          level={level}
          focus={sel?.focus ?? null}
          label={`${t("calendar.ui.map")} ${ym}`}
          onView={onView}
          status={{ kind, tail }}
          win={ymWord(lang, o.y, o.m)}
        />
      </div>
      <div className={cx("cl-mleg")}>
        {hint ? <span className={cx("cl-cm")} data-map-hint="">{hint}</span> : null}
        {nIo ? (
          <span className={cx("cl-flag")}>
            {t("calendar.flag.interval_out")} <span className={cx("num")}>{nIo}</span>
          </span>
        ) : null}
        <span className={cx("cl-cm")}>{unit}</span>
      </div>
    </>
  );
}
