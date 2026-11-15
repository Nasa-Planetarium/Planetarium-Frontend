"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { boundaryQuery } from "@/entities/country";
import { useCoarseCells, type CoarseAoi } from "@/entities/world-grid";
import { ApiError, cellsTooMany, hotspotsTooWide } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { aoisQuery, boundaryApiQuery, cellsQuery, hotspotsMonthQuery, type CellsData } from "../api/queries";
import type { CalView } from "../model/calendar";
import { caseFor, cellCase, fmtNum, fmtVal, iso3OfAoi, monthIndex, ymIso } from "../model/calendar";
import { Status } from "./bits";
import { unitWord } from "./cal-grid";
import { cx } from "./cx";
import { displayInterval, hasSpread } from "@/shared/lib/interval";
import { DotMap, type DotCell } from "./dot-map";
import { WorldReplay } from "./world-replay";

/**
 * M 그 달 지도(목업 drawMap): 전 세계 = 재생 층을 그 달에 멈춘 상태 · 그 밖 = 점(원) 지도(칸 원 + 한국이면 감지 점 재생).
 * 윤곽 = /aois/{id}/boundary(계약). 목(MSW)은 경계·칸·점이 503 이라 한국 밖은 셸이 이미 받은 나라 1급 경계(geo/c)로, 한국은 윤곽 없이 그린다.
 */
const K_T = [0.3, 0.48, 0.66, 0.84, 1];

export function CalMap(o: { aoi: string; aois?: CoarseAoi[] | null; y: number; m: number; view: CalView; mv: string | null; inGb: boolean; ramp: (t: number) => string; onCountry: (iso3: string, i: number) => void; onWorldMonth: (i: number) => void }) {
  const t = useT();
  const lang = useLocale();
  const ym = ymIso(o.y, o.m);
  const world = o.aoi === "WORLD";
  /* 서버가 400 range_too_large 로 거절할 범위는 /aois 행(n_cells · level · bbox)으로 미리 가려 요청하지 않는다(브라우저 콘솔 400 없게).
     목록을 받기 전에는 칸·점 요청을 미룬다 — 판정 없이 먼저 보냈다 거절당하던 것(2026-11-15 운영: USA·BRA /cells, JPN·USA·BRA /hotspots) */
  const aq = useQuery(aoisQuery(o.mv));
  const known = !aq.isPending;
  const rec = (aq.data ?? []).find((a) => a.aoi_id === o.aoi) ?? null;
  const cellsWide = cellsTooMany(rec);
  /* 달이 바뀌어도 지도(DotMap)를 유지한다(F14 LF-1): 새 달 자료가 오기 전까지 앞 달 자료를 둔다 */
  const cq0 = useQuery({ ...cellsQuery(o.aoi, ym, o.mv, !world && known && !cellsWide), placeholderData: keepPreviousData });
  /* 칸 1만 개를 넘는 범위(대륙·큰 나라)는 정적 world-1deg 1° 묶음으로 — 미리 판정 · 판정 못 한 지역은 서버 400 을 받고(안전망) */
  const wide = cellsWide || (cq0.error instanceof ApiError && cq0.error.code === "range_too_large");
  const co = useCoarseCells({ aoiId: o.aoi, aois: o.aois, y: o.y, m: o.m, on: wide });
  const wideErr = cq0.error ?? new ApiError(400, "range_too_large", null);
  const cq: { data: CellsData | undefined; error: unknown; isPending: boolean } = wide ? { data: (co.data ?? undefined) as CellsData | undefined, error: co.isError ? wideErr : null, isPending: co.isPending } : cq0;
  const bq = useQuery(boundaryApiQuery(o.aoi, o.mv, !world));
  const iso3 = iso3OfAoi(o.aoi);
  const geoQ = useQuery({ ...boundaryQuery(iso3 ?? "KOR"), enabled: !world && bq.isError && !!iso3 && iso3 !== "KOR" });
  const sel = world ? null : caseFor(ym, o.aoi, o.inGb);
  const ptsWide = hotspotsTooWide(rec);
  const hq = useQuery({ ...hotspotsMonthQuery(o.aoi, ym, sel?.caseId ?? null, o.mv, !!sel && known && !ptsWide), placeholderData: keepPreviousData });
  /* 자리표시는 처음 한 번만 — 한 번 지도를 그린 뒤에는 달을 바꿔도 지도를 빼지 않는다(F14 LF-1) */
  const [drawn, setDrawn] = useState(false);
  const ramp = o.ramp;
  const rampAt = useMemo(() => (k: number) => ramp(K_T[k] ?? 1), [ramp]);

  const unit = unitWord(t, o.view);
  const feats = useMemo(
    () =>
      (cq.data?.features ?? []).map((f) => {
        const k = cellCase(f.properties, o.view, o.y, o.m);
        return { p: f.properties, ...k };
      }),
    [cq.data, o.view, o.y, o.m],
  );
  const shown = useMemo(() => feats.filter((k) => k.value != null && k.value > 0 && k.p.cell_lon != null && k.p.cell_lat != null), [feats]);
  const cells: DotCell[] = useMemo(
    () =>
      shown.map((k) => {
        const iv = displayInterval(k.value, k.lo, k.hi);
        return {
          lon: k.p.cell_lon as number,
          lat: k.p.cell_lat as number,
          value: k.value as number,
          valueText: fmtVal(lang, k.value),
          extra: [unit, hasSpread(iv) ? `${t("calendar.k.interval")} ${fmtVal(lang, iv.lo)} – ${fmtVal(lang, iv.hi)}` : "", k.io ? t("calendar.flag.interval_out") : "", k.status && k.status !== "ok" ? t(`shell.st.${k.status}`) : ""]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    [shown, lang, unit, t],
  );
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
        <WorldReplay mv={o.mv} month={monthIndex(o.y, o.m)} ramp={o.ramp} partialLine={(p) => t("calendar.ui.partial_line", p)} onCountry={o.onCountry} onMonth={o.onWorldMonth} />
      </div>
    );

  const tooLarge = ptsWide || (hq.error instanceof ApiError && hq.error.code === "range_too_large");
  const waiting0 = cq.isPending || bq.isPending || (!!sel && !ptsWide && hq.isPending);
  if (!waiting0 && !drawn) setDrawn(true);
  const waiting = waiting0 && !drawn;
  const cellErr = cq.error instanceof ApiError ? cq.error : null;
  const size = cq.data?.properties?.cell_size_deg ?? 0.1;
  const st = cq.data?.properties?.month_status ?? "ok";
  const nIo = shown.filter((k) => k.io).length;
  const nMiss = feats.filter((k) => k.value == null).length;
  const errWord = (e: unknown) => t(e instanceof ApiError && e.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.network");

  return (
    <>
      <div className={cx("cl-map")} data-map="" data-cells={cq.data ? String(cells.length) : ""}>
        {waiting ? <div className={cx("cl-dm")}><div className={cx("cl-dmw")}><div className={cx("cl-dmmap")} /></div></div> : (
          <DotMap
            cells={cells}
            size={size}
            outlines={outlines}
            pts={hq.data ?? null}
            ptsWanted={!!sel && !tooLarge}
            focus={sel?.focus ?? null}
            label={`${t("calendar.ui.map")} ${ym}`}
            rampAt={rampAt}
            extra={hq.error && !tooLarge ? <span className={cx("cl-dmnote")}>{`${t("calendar.dm.pts")} · ${errWord(hq.error)}`}</span> : null}
          />
        )}
      </div>
      <div className={cx("cl-mleg")}>
        {cellErr ? (
          <span className={cx("cl-cm")}>{errWord(cellErr)}</span>
        ) : (
          <>
            <span className={cx("cl-cm num")}>{`${t("calendar.ui.cells_n", { n: fmtNum(lang, cells.length) })} · ${t("calendar.ui.deg", { d: size })}`}</span>
            {st !== "ok" ? <Status st={st} /> : null}
            {nMiss ? <span className={cx("cl-cm num")}>{`${t("shell.st.missing")} ${fmtNum(lang, nMiss)}`}</span> : null}
            {nIo ? (
              <span className={cx("cl-flag")}>
                {t("calendar.flag.interval_out")} <span className={cx("num")}>{nIo}</span>
              </span>
            ) : null}
          </>
        )}
        <span className={cx("cl-cm")}>{unit}</span>
      </div>
    </>
  );
}
