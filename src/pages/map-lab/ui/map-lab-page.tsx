"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { countriesQuery } from "@/entities/country";
import { methodQuery } from "@/entities/release";
import { useAgency } from "@/shared/agency";
import { api, unwrap } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { adm1RegionsQuery, aoiGeometry, childRegionsQuery, downloadMapPng, focusBoundaryQuery, geomMainBounds, MapCanvas, type Bbox, type DrawnAoi, type LayerKey, type MapCanvasHandle, type MapHotspot } from "@/widgets/map-canvas";
import s from "./map-lab.module.css";

/**
 * 공통 지도 시험대(작업 단위 W1) — 화면(W5–W11)에 붙이기 전에 부품을 실제 데이터로 열어 보는 곳. 메뉴에는 없다.
 * 프리셋은 범위 시험용이다(한 지역에 묶인 값이 아니다): 시도 아래 시군구(실제 API 경계) · 나라 1급(정적 geo/c) · 다른 나라.
 * 감지 점 = 실제 API /hotspots(그 범위·그 기간). 불·자원 = 기관 연동 포트 목(useAgency — 한국 프리셋에서만, 겹침 묶음 시험).
 */
type Preset = { id: string; iso3: string; parent: string | null; start: string; end: string; bbox?: Bbox };
const PRESETS: Preset[] = [
  { id: "SIDO_47", iso3: "KOR", parent: "SIDO_47", start: "2025-03-20", end: "2025-03-31" },
  { id: "KOR", iso3: "KOR", parent: null, start: "2025-03-20", end: "2025-03-31" },
  { id: "SIDO_51", iso3: "KOR", parent: "SIDO_51", start: "2025-03-01", end: "2025-04-30" },
  // 나라 전체는 점 요청 한도(100 제곱도)를 넘어 처음 시야를 큰 불이 난 곳으로 둔다 — 전체 보기 단추로 나라 전체
  { id: "ESP", iso3: "ESP", parent: null, start: "2025-08-08", end: "2025-08-20", bbox: [-9.4, 41.4, -5.4, 43.9] },
  { id: "USA", iso3: "USA", parent: null, start: "2025-01-06", end: "2025-01-20", bbox: [-119.6, 33.4, -117.2, 34.8] },
];

export function MapLabPage() {
  const t = useT();
  const lang = useLocale();
  const ref = useRef<MapCanvasHandle>(null);
  const [pi, setPi] = useState(0);
  const P = PRESETS[pi]!;
  const [range, setRange] = useState({ start: P.start, end: P.end });
  const [aoi, setAoi] = useState<DrawnAoi | null>(null);
  const [hi, setHi] = useState<string[]>([]);
  const mv = useQuery(methodQuery()).data?.method_version ?? null;
  const countries = useQuery(countriesQuery()).data;
  const info = countries?.find((c) => c.iso3 === P.iso3) as { bbox?: Bbox; bbox_main?: Bbox; name_ko?: string; name_en?: string } | undefined;

  const kids = useQuery(childRegionsQuery(P.parent ?? "", lang, mv));
  const adm1 = useQuery(adm1RegionsQuery(P.iso3, lang));
  const focus = useQuery(focusBoundaryQuery(P.parent, mv)).data ?? null;
  // 시도 아래 시군구 경계는 실제 API(MSW 스냅숏은 503) — 못 받으면 나라 1급(정적 geo/c)으로 그린다
  const regions = P.parent && kids.data?.length ? kids.data : (adm1.data ?? []);
  const view: Bbox | null = useMemo(() => P.bbox ?? (P.parent && focus ? geomMainBounds(focus) : null) ?? info?.bbox_main ?? info?.bbox ?? null, [P.bbox, P.parent, focus, info]);

  // 점은 보이는 범위로 받는다(실서버는 100 제곱도 넘는 범위를 400 range_too_large 로 거절 — 넓으면 확대 안내)
  const [vb, setVb] = useState<Bbox | null>(null);
  const area = vb ? Math.abs((vb[2] - vb[0]) * (vb[3] - vb[1])) : Infinity;
  const hb: Bbox = vb && area <= 100 ? (vb.map((v) => Math.round(v * 100) / 100) as Bbox) : (view ?? [124, 33, 132, 39]);
  const hotQ = useQuery({
    queryKey: ["map-lab", "hotspots", hb.join(","), range.start, range.end, mv],
    queryFn: ({ signal }) =>
      api
        .GET("/hotspots", { params: { query: { bbox: [...hb], start: range.start, end: range.end, limit: 5000 } }, querySerializer: { array: { style: "form", explode: false } }, signal })
        .then(unwrap) as Promise<unknown>,
    enabled: !!mv && !!vb && area <= 100,
    retry: false,
  });
  const hot: MapHotspot[] = useMemo(() => {
    const H = ((hotQ.data as { hotspots?: { latitude: number; longitude: number; instrument?: string; frp?: number; confidence?: string; acq_datetime_utc?: string }[] } | undefined)?.hotspots ?? []);
    return H.map((h) => ({ lat: h.latitude, lon: h.longitude, sensor: h.instrument ?? "VIIRS", frp: h.frp ?? null, conf: h.confidence ?? null, time: h.acq_datetime_utc?.replace("T", " ").replace(":00Z", " UTC") ?? null }));
  }, [hotQ.data]);

  const agency = useAgency();
  const kor = P.iso3 === "KOR";
  const fires = useQuery({ queryKey: ["agency", "fires"], queryFn: () => agency.listFires(), staleTime: Infinity, enabled: kor }).data ?? [];
  const units = useQuery({ queryKey: ["agency", "units"], queryFn: () => agency.listUnits(), staleTime: Infinity, enabled: kor }).data ?? [];
  const [selFire, setSelFire] = useState<string | null>(null);
  const liveFires = kor ? fires.filter((f) => !f.historical).map((f) => ({ id: f.id, lat: f.lat, lon: f.lon, level: f.level || 1, status: f.status, name: f.name, frp_max: f.frp_max })) : [];
  const mapUnits = kor ? units.map((u) => ({ id: u.id, lat: u.lat, lon: u.lon, status: u.status, type: u.type, name: u.name, sub: u.org })) : [];
  const routes = kor ? units.filter((u) => u.status === "enroute" && typeof u.fire_id === "string").flatMap((u) => { const f = fires.find((x) => x.id === u.fire_id); return f ? [{ unit: u.id, from: { lat: u.lat, lon: u.lon }, to: { lat: f.lat, lon: f.lon }, progress: typeof u.progress === "number" ? u.progress : 0.5 }] : []; }) : [];

  const menu: { k: LayerKey; label: string }[] = [
    { k: "heat", label: t("home.over.hotspots") },
    { k: "fires", label: t("home.over.fires") },
    { k: "units", label: t("home.over.response_units") },
    { k: "boundaries", label: t("home.over.boundaries") },
    { k: "rivers", label: t("home.set_layer_k.river") },
    { k: "relief", label: t("maplab.relief") },
  ];
  const name = (p: Preset) => t(`maplab.preset.${p.id}`);
  const aoiTxt = aoi ? JSON.stringify(aoiGeometry(aoi).coordinates[0]?.slice(0, 6).map((q) => q.map((v) => Math.round(v * 1000) / 1000))) : "";

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <b>{t("maplab.title")}</b>
        <span className={s.grp} role="group" aria-label={t("maplab.range")}>
          {PRESETS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={i === pi}
              className={s.chip}
              data-preset={p.id}
              onClick={() => {
                setPi(i);
                setRange({ start: p.start, end: p.end });
                setAoi(null);
                setHi([]);
              }}
            >
              {name(p)}
            </button>
          ))}
        </span>
        <label className={s.f}>
          {t("maplab.start")}
          <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} />
        </label>
        <label className={s.f}>
          {t("maplab.end")}
          <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} />
        </label>
        <button type="button" className={s.chip} data-png="" onClick={() => downloadMapPng(ref.current, `${name(P)} · ${range.start}–${range.end}`, `emberline-map-${P.id}`)}>
          {t("maplab.png")}
        </button>
      </div>
      <MapCanvas
        ref={ref}
        className={s.map}
        testId="map-lab"
        iso3={P.iso3}
        view={view}
        regions={regions}
        hiRegions={hi}
        focus={focus}
        hotspots={hot}
        fires={liveFires}
        units={mapUnits}
        routes={routes}
        selFire={selFire}
        onFire={setSelFire}
        onRegion={(id) => setHi([id])}
        onView={(b) => setVb(b)}
        aoi={aoi}
        onDraw={setAoi}
        tools={["layers", "bbox", "polygon", "point"]}
        layerMenu={menu}
        ticks
        offView={aoi ? { pts: [[aoiGeometry(aoi).coordinates[0]![0]![1]!, aoiGeometry(aoi).coordinates[0]![0]![0]!]], label: t(`home.aoi.${aoi.type === "point" ? "drawn" : aoi.type}`) } : null}
        status={vb && area > 100 ? t("map.level.fixed", { window: `${range.start}–${range.end}` }) : hotQ.isError ? t("shell.pts.pending") : null}
      />
      <div className={s.foot} data-readout="">
        <span>
          {t("maplab.points", { n: hot.length })} · {t("maplab.regions", { n: regions.length })}
        </span>
        {aoi ? (
          <span data-aoi-type={aoi.type}>
            {t(`home.aoi.${aoi.type === "point" ? "drawn" : aoi.type}`)} · <code>{aoiTxt}</code>
            <button type="button" className={s.chip} onClick={() => setAoi(null)}>
              ×
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
