"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Layers } from "lucide-react";
import { useLocale } from "next-intl";
import { methodQuery } from "@/entities/release";
import { adm1RegionsQuery, childRegionsQuery, downloadMapPng, MapCanvas, type Bbox, type MapCanvasHandle } from "@/widgets/map-canvas";
import { useT } from "@/shared/i18n";
import type { FireMeta, LandFire } from "../model/land";
import { cx } from "./cx";


type GeoData = Parameters<GeoJSONSource["setData"]>[0];
/**
 * 피해 면적 지도 — MapLibre 2D(결정 F9: 점은 원). 목업 map3d 의 평면 판 몫만:
 * 바탕(map-void) + 나라 경계 · 고른 불 소실 범위(h5 채움 16% + 실선 2px) · 다른 불 소실 범위(h4 50% 점선, 칸 안에 다 들 때만) ·
 * 불 표지(조준 고리 — 진화 끝 = text-3 파선, 과거 = 단계색 점선, 고른 불 = cosmo-star 선택 고리) · 면적 이름표 + 면·리 이름.
 * 도구: 레이어(소실 범위·핫스팟·시군 이름) · PNG / 확대·축소·전체 보기 / 축척 / 출처 / 범례.
 */
export interface LandMapProps {
  fires: LandFire[];
  metas: Record<string, FireMeta>;
  selId: string | null;
  layers: { burns: boolean; hot: boolean; bounds: boolean };
  onSelect: (id: string) => void;
  onLayer: (k: "burns" | "hot" | "bounds", v: boolean) => void;
  areaLabel: string;
  placeLabel: string;
  pngName: string;
  className?: string;
}

const tok = (name: string) => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim());
const FM_R = { s: 6.4, m: 8, l: 10 } as const;
type MarkState = "live" | "half" | "closed" | "hist";
const CLOSED = ["contained", "out", "resolved"];
function markOf(f: LandFire) {
  const state: MarkState = f.historical ? "hist" : CLOSED.includes(f.status) ? "closed" : f.status === "onscene" ? "half" : "live";
  const v = f.frp_max;
  const size = v == null || v >= 80 ? "l" : v >= 20 ? "m" : "s";
  return { level: f.level || 1, state, size, major: f.burned_ha >= 100 } as const;
}
const markColor = (o: { state: MarkState; level: number }) => (o.state === "closed" ? "var(--text-3)" : `var(--alert-${Math.max(1, Math.min(4, o.level))})`);

/** 목업 EM.fireMarkSVG(진화 끝·과거 상태 몫 + 선택 고리) */
function FireMark({ f, sel, x, y }: { f: LandFire; sel: boolean; x?: number; y?: number }) {
  const o = markOf(f);
  const r = FM_R[o.size];
  const k = r / 10;
  const sw = o.major ? 3 : o.state === "closed" ? 1.5 : 2;
  const c = markColor(o);
  const half = (2 * r + 18 * k + 4) / 2 + (sel ? 2 : 0);
  const w = 2 * half;
  const pos = x == null ? undefined : { position: "absolute" as const, left: x - half, top: (y ?? 0) - half };
  return (
    <svg width={w} height={w} viewBox={`0 0 ${w} ${w}`} aria-hidden="true" style={pos}>
      <circle cx={half} cy={half} r={r - sw / 2} fill="none" stroke="var(--map-halo)" strokeWidth={sw + 2} />
      <circle
        cx={half}
        cy={half}
        r={r - sw / 2}
        fill="none"
        stroke={c}
        strokeWidth={sw}
        strokeDasharray={o.state === "closed" ? "3 2" : o.state === "hist" ? "0.1 3.4" : undefined}
        strokeLinecap={o.state === "hist" ? "round" : undefined}
      />
      {o.state === "live" ? <circle cx={half} cy={half} r={3.75 * k} fill={c} /> : null}
      {sel ? <circle cx={half} cy={half} r={r + 4} fill="none" stroke="var(--cosmo-star)" strokeWidth={2} /> : null}
    </svg>
  );
}

const ring = (poly: [number, number][]) => [...poly.map(([la, lo]) => [lo, la]), poly[0] ? [poly[0][1], poly[0][0]] : []];
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features });

export function LandMap(p: LandMapProps) {
  const t = useT();
  const ref = useRef<MapCanvasHandle>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const ready = !!map;
  const [frame, setFrame] = useState(0);
  const [pop, setPop] = useState(false);
  const sel = useMemo(() => p.fires.find((f) => f.id === p.selId) ?? null, [p.fires, p.selId]);
  /* 바탕 경계 = 시나리오 시도(경상북도)의 시군구(실제 API 경계) · 스냅숏(MSW)은 나라 1급 */
  const lang = useLocale();
  const mv = useQuery(methodQuery()).data?.method_version ?? null;
  const kids = useQuery(childRegionsQuery("SIDO_47", lang, mv)).data;
  const adm1 = useQuery(adm1RegionsQuery("KOR", lang)).data;
  const regions = kids?.length ? kids : (adm1 ?? []);

  /* 공통 지도(바탕·음영·하천·경계) 위에 소실 범위 층을 얹는다 */
  const onReady = useCallback((m: MlMap) => {
    const empty = fc([]);
    m.addSource("burn-other", { type: "geojson", data: empty });
    m.addSource("burn-sel", { type: "geojson", data: empty });
    m.addLayer({ id: "burn-other", type: "line", source: "burn-other", paint: { "line-color": tok("h4"), "line-opacity": 0.5, "line-width": 1, "line-dasharray": [3, 4] } });
    m.addLayer({ id: "burn-sel-fill", type: "fill", source: "burn-sel", paint: { "fill-color": tok("h5"), "fill-opacity": 0.16 } });
    m.addLayer({ id: "burn-sel-line", type: "line", source: "burn-sel", paint: { "line-color": tok("h5"), "line-width": 2 } });
    setMap(m);
  }, []);

  /* 소실 범위 */
  useEffect(() => {
    if (!map) return;
    const feat = (poly: [number, number][]) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring(poly)] } });
    const selPoly = sel ? (p.metas[sel.id]?.burn_poly ?? []) : [];
    (map.getSource("burn-sel") as GeoJSONSource | undefined)?.setData(fc(p.layers.burns && selPoly.length ? [feat(selPoly)] : []) as GeoData);
  }, [map, sel, p.metas, p.layers.burns]);

  /* 다른 불 윤곽: 다각형 전체가 지도 칸 안에 들 때만(목업 r5) */
  const view = useMemo(() => {
    if (!map) return null;
    const c = map.getContainer();
    const w = c.clientWidth;
    const h = c.clientHeight;
    const proj = (la: number, lo: number) => {
      const q = map.project([lo, la]);
      return [q.x, q.y] as const;
    };
    const inBox = (x: number, y: number, m = 0) => x >= -m && y >= -m && x <= w + m && y <= h + m;
    const others = p.layers.burns
      ? p.fires.filter((f) => f.id !== p.selId && (p.metas[f.id]?.burn_poly ?? []).length && (p.metas[f.id]?.burn_poly ?? []).every(([la, lo]) => inBox(...proj(la, lo), 2)))
      : [];
    const marks = p.fires.map((f) => ({ f, xy: proj(f.lat, f.lon) })).filter((m) => inBox(m.xy[0], m.xy[1]));
    let label: { x: number; y: number; px: number; py: number } | null = null;
    let selXY: readonly [number, number] | null = null;
    if (sel) {
      const poly = p.metas[sel.id]?.burn_poly ?? [];
      const P = poly.length ? poly.map(([la, lo]) => proj(la, lo)) : [proj(sel.lat, sel.lon)];
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      P.forEach(([x, y]) => {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      });
      let [mx, my] = proj(sel.lat, sel.lon);
      if (!(mx >= x0 && mx <= x1 && my >= y0 && my <= y1)) {
        mx = (x0 + x1) / 2;
        my = (y0 + y1) / 2;
      }
      selXY = [mx, my];
      if (p.layers.burns && poly.length) {
        const cx = (x0 + x1) / 2;
        const ext = Math.max(x1 - x0, y1 - y0);
        const small = ext < 44;
        let lx = cx;
        let ly = y1 + 18;
        if (small) {
          lx = cx + ext / 2 + 9 + 8 + 24;
          ly = (y0 + y1) / 2;
        }
        lx = Math.max(38, Math.min(w - 80, lx));
        ly = Math.max(60, Math.min(h - 70, ly));
        label = { x: lx, y: ly, px: lx, py: ly + 18 };
      }
    }
    return { w, h, others, marks, label, selXY };
    // frame: 카메라가 움직일 때마다 다시 잰다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, frame, p.fires, p.metas, p.selId, p.layers.burns, sel]);

  useEffect(() => {
    if (!map || !view) return;
    const feats = view.others.map((f) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring(p.metas[f.id]?.burn_poly ?? [])] } }));
    (map.getSource("burn-other") as GeoJSONSource | undefined)?.setData(fc(feats) as GeoData);
  }, [map, view, p.metas]);

  /* 전체 보기 = 원장 불 전체 범위 */
  const allView: Bbox | null = useMemo(() => {
    if (!p.fires.length) return null;
    return [Math.min(...p.fires.map((f) => f.lon)) - 0.05, Math.min(...p.fires.map((f) => f.lat)) - 0.05, Math.max(...p.fires.map((f) => f.lon)) + 0.05, Math.max(...p.fires.map((f) => f.lat)) + 0.05];
  }, [p.fires]);

  /* 고른 불로 맞추기(목업 fitTo: 다각형 ± 40%, 위 1.3·아래 1.5, 여백 56, 지도 상한까지) */
  const fit = useCallback(() => {
    if (!map) return;
    const f = sel;
    const poly = f ? (p.metas[f.id]?.burn_poly ?? []) : [];
    if (!f || !poly.length) {
      if (allView) ref.current?.fitBounds(allView, 24);
      return;
    }
    let s = 90, n = -90, w = 180, e = -180;
    poly.forEach(([la, lo]) => {
      s = Math.min(s, la);
      n = Math.max(n, la);
      w = Math.min(w, lo);
      e = Math.max(e, lo);
    });
    const pl = (n - s) * 0.4;
    const po = (e - w) * 0.4;
    const cam = map.cameraForBounds([[w - po, s - pl * 1.5], [e + po, n + pl * 1.3]], { padding: 56, maxZoom: map.getMaxZoom() });
    if (cam) map.jumpTo({ center: cam.center, zoom: cam.zoom ?? map.getZoom() });
  }, [map, sel, p.metas, allView]);
  const fitKey = `${p.selId}|${ready}`;
  const lastFit = useRef("");
  useEffect(() => {
    if (!ready || lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    fit();
  }, [ready, fitKey, fit]);

  /* 지도 PNG(목업 land.js:404 — 제목 띠 「{이름} 소실 범위 {ha}(추정)」 붙인 스냅숏) */
  const png = () => {
    downloadMapPng(ref.current, [p.placeLabel, p.areaLabel].filter(Boolean).join(" · "), p.pngName);
  };

  /* 범례(목업 syncKey): 지도 칸 안에 보이는 것만 */
  const key = useMemo(() => {
    const items: { label: string; kind: string; c?: string; f?: LandFire }[] = [];
    const shown = view?.marks.map((m) => m.f) ?? [];
    const closed = shown.find((f) => markOf(f).state === "closed");
    if (closed) items.push({ label: t("land.sync_key.contained_fire"), kind: "fire", f: { ...closed, frp_max: 100, burned_ha: 0 } });
    const hist = shown.filter((f) => f.historical);
    const h0 = hist[0];
    if (h0) items.push({ label: t("land.g.past_fires"), kind: "fire", f: { ...h0, level: Math.max(...hist.map((x) => x.level || 1)) as LandFire["level"], frp_max: 100 } });
    if (p.layers.burns) {
      items.push({ label: t("land.sync_key.selected_burn_extent_est"), kind: "sq", c: "var(--h4)" });
      if (view?.others.length) items.push({ label: t("land.sync_key.other_burn_extents"), kind: "dash", c: "var(--h4)" });
    }
    if (p.layers.hot) items.push({ label: t("land.sync_key.viirs_pixel_375_m"), kind: "ring", c: "var(--h5)" });
    return items;
  }, [view, p.layers, t]);

  return (
    <MapCanvas
      ref={ref}
      className={cx("map", p.className)}
      testId="land-map"
      iso3="KOR"
      view={allView}
      regions={regions}
      layers={{ heat: false, hotspots: false, boundaries: p.layers.bounds, labels: p.layers.bounds }}
      onReady={onReady}
      onMove={() => setFrame((n) => n + 1)}
      ticks
    >
      <div className={cx("ovl")} style={{ pointerEvents: "none" }}>
        {view?.marks
          .filter((m) => m.f.id !== p.selId)
          .map((m) => (
            <button
              key={m.f.id}
              type="button"
              aria-label={m.f.name}
              onClick={() => p.onSelect(m.f.id)}
              style={{ position: "absolute", left: m.xy[0] - 14, top: m.xy[1] - 14, width: 28, height: 28, padding: 0, border: 0, background: "transparent", pointerEvents: "auto", display: "grid", placeItems: "center" }}
            >
              <FireMark f={m.f} sel={false} />
            </button>
          ))}
        {sel && view?.selXY ? <FireMark f={sel} sel x={view.selXY[0]} y={view.selXY[1]} /> : null}
        {view?.label ? (
          <>
            <span className={cx("m-lbl")} style={{ left: view.label.x, top: view.label.y }}>
              {p.areaLabel}
            </span>
            {p.placeLabel ? (
              <span className={cx("m-place")} style={{ left: view.label.px, top: view.label.py }}>
                {p.placeLabel}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <div className={cx("map-ui")} style={{ pointerEvents: "none" }}>
        <div className={cx("mtools")} role="toolbar" aria-label={t("shell.map.tools")}>
          <button type="button" data-mt="layers" aria-expanded={pop} aria-haspopup="true" onClick={() => setPop((v) => !v)}>
            <Layers aria-hidden="true" />
            <span>{t("shell.map.layers")}</span>
          </button>
          <button type="button" data-mt="png" onClick={png}>
            <ImageIcon aria-hidden="true" />
            <span>PNG</span>
          </button>
        </div>
        {pop ? (
          <div className={cx("mtools-pop")} role="group" aria-label={t("shell.map.layers")}>
            {(
              [
                ["burns", "land.at.burn_extent"],
                ["hot", "land.at.hotspots"],
                ["bounds", "land.at.district_names"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" checked={p.layers[k]} onChange={(e) => p.onLayer(k, e.target.checked)} />
                {t(label)}
              </label>
            ))}
          </div>
        ) : null}
        {key.length ? (
          <div className={cx("map-key")}>
            {key.map((it) => (
              <span key={it.label}>
                {it.f ? (
                  <i className={cx("k-fmk")}>
                    <FireMark f={it.f} sel={false} />
                  </i>
                ) : (
                  <i className={cx(it.kind === "dash" ? "k-dash" : it.kind === "ring" ? "k-ring" : it.kind === "dot" ? "k-dot" : "")} style={{ ["--c" as string]: it.c }} />
                )}
                {it.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </MapCanvas>
  );
}
