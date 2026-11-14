"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Truck, X } from "lucide-react";
import { focusBoundaryQuery, geomMainBounds, MapCanvas, type Bbox, type LayerKey, type MapCanvasHandle, type MapHotspot } from "@/widgets/map-canvas";
import { iso3OfAoi } from "@/features/pick-aoi";
import { ApiError } from "@/shared/api";
import { useDevice } from "@/shared/lib/use-device";
import { hotspotsQuery } from "../api/queries";
import { ACTIVE } from "../model/home";
import { cx } from "./cx";
import type { Ctx } from "./home-page";
import { HomePass } from "./home-pass";
import { Feed } from "./home-side";

/** 점 요청 한도 — 실서버는 100 제곱도 넘는 범위를 400(range_too_large)으로 거절한다 */
const MAX_AREA = 100;
const r2 = (v: number) => Math.round(v * 20) / 20;

/**
 * 상황판 지도 — 공통 지도(widgets/map-canvas, 목업 map3d EMMap3D 이식) 위에 상황판 몫만 얹는다.
 *  - 바탕: 지형 음영·바깥 가림·하천·도로·경계(고른 범위 아래 단)·이름표 비키기·경위도 눈금 = 공통 지도
 *  - 감지 점 = 실제 API /hotspots(지도 기간 · 보이는 범위, 100 제곱도 넘으면 확대 안내) — 확대하면 화소 사각형, 누르면 툴팁
 *  - 불·자원·출동 경로 = 기관 연동 포트 목(한국 시나리오만) — 겹친 자원은 묶음
 *  - 사각형·다각형·좌표+반경 그리기 → 관심 영역(home-page 가 집계 지역으로 바꿔 캘린더·지표·CSV 에 반영) + 배지(해제 ×)
 *  - 검색 = 지금 나라의 모든 지역(실제 /aois 이름) — 고르면 지역 범위가 바뀐다
 */
export function HomeMap(c: Ctx) {
  const phone = useDevice() === "phone";
  const [stop, setStop] = useState<"peek" | "half" | "full">("peek");
  const STOPS = ["peek", "half", "full"] as const;
  const [q, setQ] = useState("");
  const S = c.scope;
  const isCountry = S.chosen === S.own;
  const focus = useQuery(focusBoundaryQuery(isCountry ? null : S.chosen, c.mv)).data ?? null;
  const info = c.info as { bbox?: Bbox; bbox_main?: Bbox } | undefined;
  /* 전체 보기 = 고른 지역 상자(실서버 /aois bbox) → 경계 윤곽 범위 → 나라 본토 범위 */
  const view: Bbox | null = useMemo(() => {
    if (!isCountry && c.aoiBbox) return c.aoiBbox;
    if (!isCountry && focus) return geomMainBounds(focus);
    return info?.bbox_main ?? info?.bbox ?? c.aoiBbox ?? null;
  }, [isCountry, c.aoiBbox, focus, info]);

  /* 감지 점 — 보이는 범위(onView)로 받는다 */
  const [vb, setVb] = useState<Bbox | null>(null);
  const area = vb ? Math.abs((vb[2] - vb[0]) * (vb[3] - vb[1])) : Infinity;
  const hb: Bbox | null = vb && area <= MAX_AREA ? (vb.map(r2) as Bbox) : null;
  const hotQ = useQuery({ ...hotspotsQuery(hb ?? [0, 0, 0, 0], c.range?.start ?? "", c.range?.end ?? "", c.range ? c.mv : null), enabled: !!hb && !!c.range && !!c.mv });
  const raw = useMemo(
    () => ((hotQ.data as unknown as { hotspots?: { latitude: number; longitude: number; instrument?: string; frp?: number; confidence?: string; acq_datetime_utc?: string }[] } | undefined)?.hotspots ?? []),
    [hotQ.data],
  );
  const hot: MapHotspot[] = useMemo(
    () => raw.map((h) => ({ lat: h.latitude, lon: h.longitude, sensor: h.instrument ?? "VIIRS", frp: h.frp ?? null, conf: h.confidence ?? null, time: h.acq_datetime_utc?.replace("T", " ").replace(/:\d\dZ$/, " UTC") ?? null })),
    [raw],
  );
  const nV = hot.filter((h) => h.sensor !== "MODIS").length;
  const nM = hot.length - nV;
  const hotErr = hotQ.error instanceof ApiError ? hotQ.error : null;

  /* 불·자원·경로(시나리오 목 — 한국만) */
  const live = useMemo(() => c.fires.filter((f) => !f.historical), [c.fires]);
  const annot = useMemo(() => live.filter((f) => ACTIVE.includes(f.status)).sort((x, y) => y.level - x.level || String(y.detected_at).localeCompare(String(x.detected_at)))[0]?.id ?? null, [live]);
  const fires = useMemo(() => live.map((f) => ({ id: f.id, lat: f.lat, lon: f.lon, level: f.level || 1, status: f.status, name: c.tl("fire", f.id, "name", f.name), frp_max: f.frp_max })), [live, c]);
  const units = useMemo(() => c.units.map((u) => ({ id: u.id, lat: u.lat, lon: u.lon, status: u.status, type: u.type, name: c.tl("unit", u.id, "name", u.name), sub: c.t(`shell.unit_status.${u.status}`) })), [c]);
  const routes = useMemo(
    () =>
      c.units
        .filter((u) => u.status === "enroute" && typeof u.fire_id === "string")
        .flatMap((u) => {
          const f = c.fires.find((x) => x.id === u.fire_id);
          return f ? [{ unit: u.id, from: { lat: u.lat, lon: u.lon }, to: { lat: f.lat, lon: f.lon }, progress: typeof u.progress === "number" ? u.progress : 0.5 }] : [];
        }),
    [c.units, c.fires],
  );

  const menu: { k: LayerKey; label: string }[] = [
    { k: "hotspots", label: c.t("home.over.hotspots") },
    { k: "fires", label: c.t("home.over.fires") },
    { k: "units", label: c.t("home.over.response_units") },
    { k: "boundaries", label: c.t("home.over.boundaries") },
    { k: "rivers", label: c.t("home.set_layer_k.river") },
    { k: "relief", label: c.t("maplab.relief") },
  ];

  /* 검색 — 지금 나라의 모든 지역(실제 /aois 이름) */
  const sugg = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    return S.aois.filter((a) => !a.hidden && a.aoi_id !== "WORLD" && iso3OfAoi(a.aoi_id) === c.iso3 && S.nameOf(a).toLowerCase().includes(k)).slice(0, 8);
  }, [q, S, c.iso3]);

  /* 관심 영역 배지(목업 renderAOIBadge): 「관심 영역 {종류} · 집계 시군 {r} ×」 */
  const approx = c.agg && c.agg.names.length ? c.t(c.agg.sgg ? "home.aoi.approx_kor" : "home.aoi.approx_adm1", { r: c.agg.names.join("·") }) : "";
  const regionLabel = c.drawn?.type === "point" ? `${c.drawnKind} · ${c.drawn.lat.toFixed(3)}°N ${c.drawn.lon.toFixed(3)}°E` : c.drawnKind;
  const hiRegions = c.agg?.ids ?? (S.focus ? [S.focus] : []);
  /* 지도 손잡이를 화면(home-page)에 넘긴다 — PNG 내려받기·날아가기 */
  const { setMapH } = c;
  const takeHandle = useCallback((h: MapCanvasHandle | null) => setMapH(h), [setMapH]);
  /* 감지 목록·검색에서 고른 불로 날아가기 */
  useEffect(() => {
    if (c.flyTo) c.mapH?.flyTo(c.flyTo.lat, c.flyTo.lon, c.flyTo.z ?? 9.6);
  }, [c.flyTo, c.mapH]);

  return (
    <MapCanvas
      ref={takeHandle}
      className={cx("hm-map")}
      testId="home-map"
      iso3={c.iso3}
      view={view}
      regions={c.mapRegions}
      hiRegions={hiRegions}
      focus={focus}
      hotspots={hot}
      fires={fires}
      units={units}
      routes={routes}
      selFire={c.selFire}
      annotFire={annot}
      onFire={(id) => c.setSelFire(id)}
      onRegion={(id) => (S.byId.has(id) ? S.setAoi(id) : undefined)}
      onView={(b) => setVb(b)}
      aoi={c.drawn}
      onDraw={(a) => c.setDrawn(a)}
      tools={["layers", "bbox", "polygon", "point"]}
      pointBounds={view}
      layerMenu={menu}
      ticks
      offView={!c.drawn && !isCountry && view ? { pts: [[(view[1] + view[3]) / 2, (view[0] + view[2]) / 2]], label: c.aoiLabel } : c.drawn ? { pts: [[(c.drawn.type === "bbox" ? (c.drawn.south + c.drawn.north) / 2 : c.drawn.type === "point" ? c.drawn.lat : c.drawn.pts[0]![0]), (c.drawn.type === "bbox" ? (c.drawn.west + c.drawn.east) / 2 : c.drawn.type === "point" ? c.drawn.lon : c.drawn.pts[0]![1])]], label: c.drawnKind } : null}
      status={vb && area > MAX_AREA ? c.t("maplab.zoom_for_points") : null}
    >
      <div className={cx("hm-ov hm-ov-tl")} style={{ pointerEvents: "none" }}>
        <div className={cx("hm-search")} role="search">
          <Search className={cx("ic ic-btn")} aria-hidden="true" strokeWidth={1.9} />
          <input type="search" placeholder={c.t("home.over.search_places")} aria-label={c.t("home.over.search_places")} autoComplete="off" data-search="" value={q} onChange={(e) => setQ(e.target.value)} />
          {sugg.length ? (
            <div className={cx("hm-sugg")} data-sugg="" role="listbox">
              {sugg.map((a) => (
                <button
                  key={a.aoi_id}
                  type="button"
                  className={cx("hm-sg")}
                  role="option"
                  aria-selected="false"
                  data-a={a.aoi_id}
                  onClick={() => {
                    c.setDrawn(null);
                    S.setAoi(a.aoi_id);
                    setQ("");
                  }}
                >
                  {S.nameOf(a)}
                  <span className={cx("dim")}>{a.parent_id && a.parent_id !== S.own ? S.nameOf(a.parent_id) : c.cname}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className={cx("hm-ov hm-ov-bl")} style={{ pointerEvents: "none" }}>
        {c.drawn ? (
          <div className={cx("hm-aoibadge")} data-aoibadge="" data-aoi-type={c.drawn.type}>
            <span className={cx("hm-aoi-k")}>{c.t("home.short_label.area")}</span>
            <b>{regionLabel}</b>
            {approx ? <span className={cx("hm-aoi-ap")}>{approx}</span> : null}
            <button type="button" className={cx("hm-x")} data-clear="" aria-label={c.t("home.render_aoibadge.clear_area")} onClick={() => c.setDrawn(null)}>
              <X className={cx("ic ic-inline")} aria-hidden="true" strokeWidth={1.9} />
            </button>
          </div>
        ) : null}
        <div className={cx("hm-lgrow")}>
          <div className={cx("hm-legend")}>
            <span>{c.t("home.over.hotspots")}</span>
            <span className={cx("hm-lgs")}>
              <i className={cx("hm-lgd v")} aria-hidden="true" />
              VIIRS
            </span>
            <span className={cx("hm-lgs")}>
              <i className={cx("hm-lgd m")} aria-hidden="true" />
              MODIS
            </span>
            <span className={cx("hm-lg-n tn")} data-hcount="" data-n={hot.length}>
              {hotErr ? c.t(hotErr.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.request") : !hb ? "–" : hotQ.isPending ? "–" : `VIIRS ${c.fmt.num(nV)}, MODIS ${c.fmt.num(nM)}`}
            </span>
            {c.kor ? (
              <span className={cx("hm-lgs hm-lg-unit")}>
                <Truck className={cx("ic ic-inline")} aria-hidden="true" strokeWidth={1.9} />
                {c.t("home.over.units")}
              </span>
            ) : null}
          </div>
          <HomePass c={c} view={view} />
        </div>
      </div>
      {phone ? (
        /* 폰: 감지 목록 바닥 시트(목업 EM.ui.sheet · 정지점 접힘 112px / 50% / 전체) */
        <div className={cx("sheet hm-sheet")} data-stop={stop} style={{ ["--sheet-h" as string]: stop === "peek" ? "112px" : stop === "half" ? "50%" : "calc(100% - var(--sp-6))" }}>
          <button
            type="button"
            className={cx("sh-grip")}
            aria-label={c.t("home.sheet.grip", { stop: c.t(`home.sheet.stop_${stop}`) })}
            onClick={() => setStop(STOPS[(STOPS.indexOf(stop) + 1) % 3]!)}
            onKeyDown={(e) => {
              const i = STOPS.indexOf(stop);
              const j = e.key === "ArrowUp" ? Math.min(2, i + 1) : e.key === "ArrowDown" ? Math.max(0, i - 1) : -1;
              if (j < 0) return;
              e.preventDefault();
              setStop(STOPS[j]!);
            }}
          />
          <div className={cx("sh-h")}>
            <Feed {...c} part="head" />
          </div>
          <div className={cx("sh-b")}>
            <Feed {...c} part="body" />
          </div>
        </div>
      ) : null}
    </MapCanvas>
  );
}
