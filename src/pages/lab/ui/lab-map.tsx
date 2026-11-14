"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { boundaryQuery, useCountry, type CountryInfo } from "@/entities/country";
import { CLS_TOK, clsOf, lvOf } from "../model/outlook";
import type { LabCtx } from "./lab-page";
import { cx } from "./cx";
import { useTok } from "./use-lab";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });
function niceLen(maxM: number) {
  const p = Math.pow(10, Math.floor(Math.log10(maxM)));
  return [1, 2, 5].map((n) => n * p).filter((v) => v <= maxM).pop() ?? p;
}

/**
 * 시군별 전망 지도 — MapLibre 2D(결정 F9: 점은 원). 목업 lab.js 의 3D 면 색 대신 지역 중심의 원 하나:
 * 원 색 = 표 「수준」과 같은 3단(--lv-low · --lv-normal · --lv-high) · 자료 부족 = --hatch-bg ·
 * 선택 = --cosmo-star 2px 링 + --map-halo 헤일로 · 원 위 표지 = 이름 + 예측 중앙값(글자 색 = 그 단계 --on-cls). 지도 위 경보 칩 0.
 */
export function LabMap(c: LabCtx) {
  const { FC, F, T_, kor, regions, sel, select, rowOf, fitBbox } = c;
  const glEl = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [frame, setFrame] = useState(0);
  const tok = useTok();
  const { iso3, info } = useCountry();
  const { data: boundary } = useQuery(boundaryQuery(iso3));

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    let made: MlMap | null = null;
    const cs = getComputedStyle(document.documentElement);
    const tk = (n: string) => cs.getPropertyValue(`--${n}`).trim();
    void import("maplibre-gl").then((ml) => {
      if (dead || !glEl.current) return;
      const m = new ml.Map({
        container: glEl.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": tk("map-void") || "#070605" } }] },
        center: [128.75, 36.6],
        zoom: 8,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      made = m;
      m.touchZoomRotate.disableRotation();
      m.on("load", () => {
        m.addSource("bounds", { type: "geojson", data: fc([]) });
        m.addSource("reg", { type: "geojson", data: fc([]) });
        m.addSource("face", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "bounds-fill", type: "fill", source: "bounds", paint: { "fill-color": tk("surface-1"), "fill-opacity": 0.55 } });
        m.addLayer({ id: "bounds-line", type: "line", source: "bounds", paint: { "line-color": tk("text-3"), "line-width": 1, "line-opacity": 0.6 } });
        /* 지역 면 단계 채움(목업 lb-fc) — 경계를 받은 한국 지역만 */
        m.addLayer({ id: "lb-face", type: "fill", source: "face", paint: { "fill-color": ["get", "c"], "fill-opacity": 0.86 } });
        m.addLayer({ id: "lb-face-line", type: "line", source: "face", paint: { "line-color": tk("line-strong"), "line-width": 0.8 } });
        m.addLayer({ id: "lb-face-on", type: "line", source: "face", filter: ["==", ["get", "on"], 1], paint: { "line-color": tk("cosmo-star"), "line-width": 2.2 } });
        m.on("click", "lb-face", (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) select(id);
        });
        m.addLayer({
          id: "lb-halo",
          type: "circle",
          source: "reg",
          filter: ["==", ["get", "on"], 1],
          paint: { "circle-radius": ["get", "r"], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": tk("map-halo"), "circle-stroke-width": 6 },
        });
        m.addLayer({
          id: "lb-fc",
          type: "circle",
          source: "reg",
          paint: {
            "circle-radius": ["get", "r"],
            "circle-color": ["get", "c"],
            "circle-opacity": 1,
            "circle-stroke-color": ["case", ["==", ["get", "on"], 1], tk("cosmo-star"), tk("line-strong")],
            "circle-stroke-width": ["case", ["==", ["get", "on"], 1], 2, 1],
          },
        });
        m.on("click", "lb-fc", (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) select(id);
        });
        setMap(m);
      });
      m.on("move", () => setFrame((n) => n + 1));
      ro = new ResizeObserver(() => {
        m.resize();
        setFrame((n) => n + 1);
      });
      ro.observe(glEl.current);
    });
    return () => {
      dead = true;
      ro?.disconnect();
      made?.remove();
    };
    // 지도는 한 번만 만든다(고르기 함수는 아래 click 이 최신 것을 쓰도록 ref 없이 select 를 그대로 — 바뀌어도 같은 동작)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 맞춤: 한국 = 고른 범위 상자(없으면 행 중심들), 밖 = 나라 본토 범위 */
  const bb = useMemo((): [number, number, number, number] | null => {
    if (kor) {
      if (fitBbox) return fitBbox;
      const ok = regions.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
      const la = ok.map((r) => r.lat);
      const lo = ok.map((r) => r.lon);
      return la.length ? [Math.min(...lo) - 0.2, Math.min(...la) - 0.16, Math.max(...lo) + 0.2, Math.max(...la) + 0.16] : null;
    }
    const inf = info as (CountryInfo & { bbox_main?: [number, number, number, number] }) | undefined;
    return inf?.bbox_main ?? inf?.bbox ?? null;
  }, [kor, regions, info, fitBbox]);
  const fit = () => {
    if (map && bb) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 32, animate: false });
  };
  const fitKey = bb ? bb.join(",") : "";
  const lastFit = useRef("");
  useEffect(() => {
    if (!map || !bb || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 32, animate: false });
  }, [map, bb, fitKey]);

  useEffect(() => {
    if (!map || !boundary) return;
    (map.getSource("bounds") as GeoJSONSource | undefined)?.setData(((boundary as { geometry?: unknown }).geometry ?? boundary) as GeoData);
  }, [map, boundary]);

  /* 지역 원(자료 붙으면 수준 색) */
  useEffect(() => {
    if (!map || !tok) return;
    const r0 = kor ? (regions.length > 12 ? 15 : 22) : 7;
    const colorOf = (id: string) => tok[CLS_TOK[clsOf(rowOf(id))] as keyof typeof tok] || tok["hatch-bg"];
    (map.getSource("face") as GeoJSONSource | undefined)?.setData(
      fc(
        regions
          .filter((r) => r.geom)
          .map((r) => {
            const g = r.geom as { geometry?: unknown };
            return { type: "Feature", properties: { id: r.id, c: colorOf(r.id), on: sel === r.id ? 1 : 0 }, geometry: g.geometry ?? g };
          }),
      ) as GeoData,
    );
    (map.getSource("reg") as GeoJSONSource | undefined)?.setData(
      fc(
        regions
          .filter((r) => !r.geom && Number.isFinite(r.lat) && Number.isFinite(r.lon))
          .map((r) => {
          const row = rowOf(r.id);
          const k = clsOf(row);
          return { type: "Feature", properties: { id: r.id, c: tok[CLS_TOK[k] as keyof typeof tok] || tok["hatch-bg"], r: r0, on: sel === r.id ? 1 : 0 }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } };
        }),
      ) as GeoData,
    );
  }, [map, tok, regions, rowOf, sel, kor]);

  /* 표지: 한국 시군은 전부, 다른 나라 1급은 40곳 이하일 때만(그보다 많으면 원 색 + 표가 말한다) */
  const marks = useMemo(() => {
    void frame;
    if (!map || !FC) return [];
    if (!kor && regions.length > 40) return [];
    return regions.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)).map((r) => {
      const p = map.project([r.lon, r.lat]);
      const row = rowOf(r.id);
      return { id: r.id, name: r.name, x: p.x, y: p.y, row, cls: clsOf(row) };
    });
  }, [map, FC, kor, regions, rowOf, frame]);
  const scale = useMemo(() => {
    void frame;
    if (!map) return null;
    const lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, map.getZoom()));
    const m = niceLen(mpp * 72);
    return { px: m / mpp, text: m >= 1000 ? `${m / 1000} km` : `${m} m` };
  }, [map, frame]);

  const LVW = { low: c.t("data.fc.level.low"), normal: c.t("data.fc.level.normal"), high: c.t("data.fc.level.high") };
  const anyNa = !!FC && FC.rows.some((r) => r.median == null || !r.level);
  const R = c.selRow;
  const H = FC;
  const pl = R?.ol?.pt != null && FC ? c.t("analysis.g6.partial", { d: FC.m.partial_as_of, v: F.n1(R.ol.pt / 10), p: F.n1((R.ol.ptp ?? 0) / 10) }) : "";

  return (
    <div className={cx("map lb-map")} data-testid="lab-map" data-map="">
      <div ref={glEl} className={cx("gl")} />
      {marks.map((m) => (
        <button
          key={m.id}
          type="button"
          className={cx("lb-fm", "lb-cls-" + m.cls, sel === m.id && "on")}
          data-r={m.id}
          aria-pressed={sel === m.id}
          aria-label={`${m.name}${T_("lab.ui.forecast_median2")}${F.n1(m.row?.median)}, ${lvOf(m.row) === "na" ? T_("lab.ui.insufficient_data") : LVW[lvOf(m.row) as keyof typeof LVW]}`}
          style={{ position: "absolute", left: m.x, top: m.y, transform: "translate(-50%,-50%)", zIndex: sel === m.id ? 3 : 1 }}
          onClick={(e) => {
            e.stopPropagation();
            select(sel === m.id ? null : m.id);
          }}
        >
          <b>{m.name}</b>
          <span className={cx("num")}>{F.n1(m.row?.median)}</span>
        </button>
      ))}
      <div className={cx("map-ui")}>
        <div className={cx("lb-mread", !c.sel && "idle")} aria-live="polite">
          {c.sel && R && H ? (
            <>
              <span className={cx("lb-mrt")}>
                {c.regLabel} <span className={cx("num")}>{F.ymS(H.month)}</span>
              </span>
              <div className={cx("lb-mrv")}>
                <b className={cx("num")}>{F.n1(R.median)}</b>
                <span>
                  80%{" "}
                  <span className={cx("num")}>
                    {F.n1(R.lo80, R.hi80)} – {F.n1(R.hi80, R.lo80)}
                  </span>
                </span>
              </div>
              <span className={cx("lb-mrs")}>
                {T_("lab.ui.normal_p50")}
                <b className={cx("num")}>{F.n1(R.baseline.p50)}</b>,{" "}
                <span className={cx("lb-lvw", "lb-lv-" + lvOf(R))}>{lvOf(R) === "na" ? T_("lab.ui.insufficient_data") : LVW[lvOf(R) as keyof typeof LVW]}</span>
              </span>
              {pl ? <span className={cx("lb-mrs lb-mrp")}>{pl}</span> : null}
            </>
          ) : null}
        </div>
        <div className={cx("zoom")}>
          <button type="button" data-z="1" aria-label={c.t("shell.map.zoom_in")} onClick={() => map?.zoomIn()}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" data-z="-1" aria-label={c.t("shell.map.zoom_out")} onClick={() => map?.zoomOut()}>
            <Minus aria-hidden="true" />
          </button>
          <button type="button" data-z="fit" aria-label={c.t("shell.map.fit")} onClick={fit}>
            <LocateFixed aria-hidden="true" />
          </button>
        </div>
        <div className={cx("map-key")}>
          {(["low", "normal", "high"] as const).map((k) => (
            <span key={k}>
              <i style={{ background: `var(--lv-${k})` }} />
              {LVW[k]}
            </span>
          ))}
          {anyNa ? (
            <span>
              <i style={{ background: "var(--hatch)", outline: "1px solid var(--line-strong)", outlineOffset: -1 }} />
              {T_("lab.ui.insufficient_data")}
            </span>
          ) : null}
        </div>
        <div className={cx("attrib")}>{(kor ? c.t("shell.map.attr_kr") : c.t("shell.map.attr_gl")).split("|")[0]}</div>
        {scale ? (
          <div className={cx("scale")}>
            <i style={{ width: scale.px }} />
            {scale.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
