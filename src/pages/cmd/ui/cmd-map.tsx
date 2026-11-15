"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import type { CountryInfo } from "@/entities/country";
import { useCoarseSum } from "@/entities/world-grid";
import type { Fire } from "@/shared/agency";
import { adm1RegionsQuery, childRegionsQuery, focusBoundaryQuery, MapCanvas, type Bbox, type LayerKey, type MapCanvasHandle, type MapFire, type MapHotspot } from "@/widgets/map-canvas";
import { ids, SEASON_MONTHS, cellVal, years } from "../model/cmd";
import type { Ctx } from "./cmd-page";
import { cx } from "./cx";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });

/**
 * 관측 밀도 지도 — 공통 지도(widgets/map-canvas · 목업 map3d) 바탕(지형 음영·하천·경계·이름표 비키기·눈금) 위에 지휘 통계 몫:
 *  - 점 = 실제 감지 점(GET /hotspots, 고른 해 · 고른 범위 — 계절·신뢰도·FRP 거름만) → 밀도 열 지도(목업 cmd 「핫스팟 관측 밀도」), 확대하면 화소
 *  - 누적(2001–2026)은 점 창이 100여 번이라 받지 않고 행 지역마다 원 하나(넓이 = 그 기간 보정 지표 합, 실제 달 값 합)
 *  - 과거 대형 산불 = 공통 지도 과거 불 표지(시나리오 목, 한국만)
 * 넓은 범위(100 제곱도 초과)는 실서버가 점을 내지 않는다 → 고른 해(계절 달만)의 월 감지량 1° 칸 합(정적 world-1deg — 캘린더·분석의 넓은 범위 규칙과 같다).
 */
export function CmdMap(c: Ctx & { hist: Fire[] }) {
  const { board, q, view, T_, kor, iso3, pts } = c;
  const lang = useLocale();
  const ref = useRef<MapCanvasHandle>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const info = c.info as (CountryInfo & { bbox_main?: Bbox }) | undefined;
  const S = c.scope;

  const onReady = useCallback((m: MlMap) => {
    const cs = getComputedStyle(document.documentElement);
    const tk = (n: string) => cs.getPropertyValue(`--${n}`).trim();
    m.addSource("cm-sum", { type: "geojson", data: fc([]) });
    m.addLayer({ id: "cm-sum", type: "circle", source: "cm-sum", paint: { "circle-radius": ["get", "r"], "circle-color": tk("map-viirs"), "circle-opacity": 0.3, "circle-stroke-color": tk("mh4"), "circle-stroke-width": 1.4 } }, m.getLayer("aoi-fill") ? "aoi-fill" : undefined);
    setMap(m);
  }, []);

  /* 맞춤: 고른 범위 상자(실서버 /aois bbox) — 나라 전체면 본토 범위 */
  const sb = S.scopeRec?.bbox;
  const bb = useMemo((): Bbox | null => {
    if (sb && sb.length === 4 && S.scope !== S.own) return sb as Bbox;
    if (kor && sb && sb.length === 4) return sb as Bbox;
    return info?.bbox_main ?? info?.bbox ?? null;
  }, [sb, kor, info, S.scope, S.own]);
  const fitKey = bb ? bb.join(",") : "";
  const lastFit = useRef("");
  useEffect(() => {
    if (!map || !bb || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    ref.current?.fitBounds(bb, 24);
  }, [map, bb, fitKey]);

  /* 경계 = 고른 범위 아래 단(실제 API) · 없으면 나라 1급 */
  const mv = S.mv;
  const kids = useQuery(childRegionsQuery(S.scope, lang, mv)).data;
  const adm1 = useQuery(adm1RegionsQuery(iso3, lang)).data;
  const regions = kids?.length ? kids : (adm1 ?? []);
  const focus = useQuery(focusBoundaryQuery(S.scope !== S.own ? S.scope : null, mv)).data ?? null;

  /* 누적: 행마다 실제 달 값 합(계절·지표 따름) → 원 넓이 */
  const sums = useMemo(() => {
    if (!board || !view.cum) return [];
    const ms = SEASON_MONTHS[q.season];
    const rows = ids(board, q.regions)
      .map((id) => {
        const r = board.regions.find((x) => x.id === id);
        let t = 0;
        years(board.cm).forEach((y) => ms.forEach((m) => (t += cellVal(board, id, y, m, q.sensor) ?? 0)));
        return r ? { lat: r.lat, lon: r.lon, v: t } : null;
      })
      .filter((x): x is { lat: number; lon: number; v: number } => !!x && x.v > 0);
    const mx = Math.max(1, ...rows.map((x) => x.v));
    return rows.map((x) => ({ ...x, r: 4 + 26 * Math.sqrt(x.v / mx) }));
  }, [board, view.cum, q]);
  useEffect(() => {
    if (!map) return;
    (map.getSource("cm-sum") as GeoJSONSource | undefined)?.setData(fc(sums.map((p) => ({ type: "Feature", properties: { r: p.r }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }))) as GeoData);
  }, [map, sums]);

  /* 넓은 범위: 고른 해 · 고른 계절 달의 1° 칸 합(누적은 행 원이 맡는다) */
  const wide = c.ptsState === "wide" && !view.cum;
  const months = useMemo(() => (view.cum ? [] : SEASON_MONTHS[q.season].map((m) => [view.year, m] as const)), [view.cum, view.year, q.season]);
  const co = useCoarseSum({ aoiId: S.scope, aois: S.aois, months, on: wide });
  const cells = wide ? (co.data?.cells ?? []) : [];

  const hot: MapHotspot[] = useMemo(() => (view.cum ? [] : pts.map((p) => ({ lat: p.lat, lon: p.lon, sensor: "VIIRS", frp: p.frp }))), [pts, view.cum]);
  const histShown: MapFire[] = useMemo(
    () =>
      (view.cum ? c.hist : c.hist.filter((f) => +f.detected_at.slice(0, 4) === view.year)).map((f) => ({ id: f.id, lat: f.lat, lon: f.lon, level: f.level || 1, status: f.status, name: f.name, historical: true, burned_ha: (f as { burned_ha?: number | null }).burned_ha ?? null })),
    [c.hist, view.cum, view.year],
  );
  const menu: { k: LayerKey; label: string }[] = [
    { k: "heat", label: T_("cmd.ui.hotspot_density") },
    { k: "fires", label: T_("cmd.ui.past_major_fire") },
    { k: "boundaries", label: T_("home.over.boundaries") },
    { k: "rivers", label: T_("home.set_layer_k.river") },
    { k: "relief", label: T_("maplab.relief") },
  ];

  return (
    <MapCanvas
      ref={ref}
      className={cx("cm-map map")}
      testId="cmd-map"
      iso3={iso3}
      view={bb}
      regions={regions}
      hiRegions={S.focus ? [S.focus] : []}
      focus={focus}
      hotspots={hot}
      cells={cells}
      density
      fires={histShown}
      onRegion={(id) => (S.byId.has(id) ? S.setAoi(id) : undefined)}
      onReady={onReady}
      tools={["layers"]}
      layerMenu={menu}
      ticks
      status={!view.cum && c.ptsState !== "ok" ? (c.ptsState === "wide" ? T_("shell.map.cells_wide_year", { p: `${view.year}`, n: String(cells.length) }) : c.ptsState === "pending" ? T_("cmd.real.loading") : c.ptsState === "rate" ? T_("shell.err.rate_limited") : T_("shell.err.request")) : null}
    >
      <div className={cx("map-key")} data-tick-avoid="">
        <b>{wide ? T_("shell.map.cells_key") : T_("cmd.ui.hotspot_density")}</b>
        <span>
          <i className={cx("ramp")} />
          {T_("cmd.ui.low_high")}
        </span>
        {kor ? (
          <span>
            <i style={{ background: "transparent", border: "2px dotted var(--alert-4)", borderRadius: "50%" }} />
            {T_("cmd.ui.past_major_fire")}
          </span>
        ) : null}
      </div>
    </MapCanvas>
  );
}
