"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { Helicopter, Layers, LocateFixed, Minus, Plus, RadioTower, Truck, Users } from "lucide-react";
import { boundaryQuery } from "@/entities/country";
import { nextPass } from "@/entities/satellite-pass";
import { useNowMs } from "@/entities/situation";
import type { Weather } from "@/shared/agency";
import { useT, useTl } from "@/shared/i18n";
import { DIRS, isClosed, type OpsFire } from "../model/ops";
import { setSlotOf, useWorld, type Merged } from "../model/store";
import { cx } from "./cx";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
type LayerKey = "heat" | "spread" | "units" | "routes";

/** 자원 종류 아이콘(목업 EM.icon heli · users · command · truck) */
const UNIT_IC: Record<string, typeof Truck> = { heli: Helicopter, crew: Users, command: RadioTower };
export function UnitIcon({ type }: { type: string }) {
  const C = UNIT_IC[type] ?? Truck;
  return <C aria-hidden="true" strokeWidth={1.9} style={{ width: "var(--ic-btn)", height: "var(--ic-btn)" }} />;
}

const tok = (name: string) => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim());
const fc = (features: unknown[]) => ({ type: "FeatureCollection" as const, features }) as GeoData;
/** 자원 상태 → 표지 색(목업 .op-pip 과 같은 토큰) */
const UNIT_C: Record<string, string> = { standby: "var(--data-unit-standby)", enroute: "var(--route)", onscene: "var(--alert-3)", return: "var(--data-unit-return)" };
const NICE = [1, 2, 5];
const niceLen = (maxM: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(maxM)));
  let best = p;
  NICE.forEach((n) => {
    if (n * p <= maxM) best = n * p;
  });
  return best;
};

/** 불 표지(목업 EM.fireMarkSVG 진행·현장·진화 끝 + 선택 고리) — 점은 원(결정 F9) */
function FireMark({ f, sel }: { f: OpsFire; sel: boolean }) {
  const closed = isClosed(f.status);
  const r = f.frp_max >= 80 ? 10 : f.frp_max >= 20 ? 8 : 6.4;
  const k = r / 10;
  const sw = closed ? 1.5 : 2;
  const c = closed ? "var(--text-3)" : `var(--alert-${Math.max(1, Math.min(4, f.level || 1))})`;
  const half = (2 * r + 18 * k + 4) / 2 + (sel ? 2 : 0);
  return (
    <svg width={2 * half} height={2 * half} viewBox={`0 0 ${2 * half} ${2 * half}`} aria-hidden="true">
      <circle cx={half} cy={half} r={r - sw / 2} fill="none" stroke="var(--map-halo)" strokeWidth={sw + 2} />
      <circle cx={half} cy={half} r={r - sw / 2} fill="none" stroke={c} strokeWidth={sw} strokeDasharray={closed ? "3 2" : undefined} />
      {!closed && f.status !== "onscene" ? <circle cx={half} cy={half} r={3.75 * k} fill={c} /> : null}
      {sel ? <circle cx={half} cy={half} r={r + 4} fill="none" stroke="var(--cosmo-star)" strokeWidth={2} /> : null}
    </svg>
  );
}

export interface OpsMapProps {
  M: Merged;
  selFireId: string | null;
  layers: Record<LayerKey, boolean>;
  fitAll: boolean;
  weather: Weather;
  onLayer: (k: LayerKey, v: boolean) => void;
  onFire: (id: string) => void;
  onUnit: (id: string) => void;
  sheet: ReactNode;
}

/**
 * 경보·출동 지도 — MapLibre 2D(결정 F9). 목업 ops.js 지도 몫:
 * 경계 · 불 표지(조준 고리) + 이름 · 자원 표지(상태색 원 + 종류 아이콘, 현장 자원은 불 둘레 자리) · 출동 경로(점선 + 이동 중 위치) ·
 * 확산 부채꼴(1·2·3h 고리, 고른 불 진하게) · 반경 2 km 마을(집 표지 + 이름·가구) · 바람 묶음 · 범례 · 레이어 · 확대/축소/전체 · 축척 · 출처.
 * 못 옮긴 것: 3D 지형 · 핫스팟 열 지도(관측 점 원장이 프런트에 없다 — /hotspots 503) · 화면 밖 표지 칩 · 이름표 겹침 비키기 · 다음 통과 관측폭.
 */
export function OpsMap(p: OpsMapProps) {
  const t = useT();
  const tl = useTl();
  const w = useWorld();
  const glEl = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [frame, setFrame] = useState(0);
  const [pop, setPop] = useState(false);
  const { data: boundary } = useQuery(boundaryQuery("KOR"));

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    let made: MlMap | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !glEl.current) return;
      const m = new ml.Map({
        container: glEl.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": tok("map-void") || "#070605" } }] },
        center: [128.85, 36.48],
        zoom: 9.5,
        maxZoom: 14.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      made = m;
      m.touchZoomRotate.disableRotation();
      m.on("load", () => {
        m.addSource("bounds", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "bounds-line", type: "line", source: "bounds", paint: { "line-color": tok("text-3"), "line-width": 1, "line-opacity": 0.6 } });
        m.addSource("routes", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "routes", type: "line", source: "routes", paint: { "line-color": tok("route"), "line-width": 2, "line-dasharray": [2, 2] } });
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
  }, []);

  useEffect(() => {
    if (!map || !boundary) return;
    (map.getSource("bounds") as GeoJSONSource | undefined)?.setData(((boundary as { geometry?: unknown }).geometry ?? boundary) as GeoData);
  }, [map, boundary]);

  const fires = useMemo(() => p.M.fires.filter((f) => !f.historical && (f.current || !isClosed(f.status))), [p.M.fires]);

  /* 첫 화면 · 개수 띠 「출동·대기」: 오늘 불 전체와 모든 자원이 지도 안(떠 있는 묶음 아래)에 들게 맞춘다 */
  const fitted = useRef(false);
  useEffect(() => {
    if (!map) return;
    if (fitted.current && !p.fitAll) return;
    fitted.current = true;
    const pts = [...fires, ...p.M.units];
    if (!pts.length) return;
    const lats = pts.map((x) => x.lat);
    const lons = pts.map((x) => x.lon);
    const c = map.getContainer();
    const W = c.clientWidth;
    const H = c.clientHeight;
    const k = Math.min(1, (Math.min(W, H) * 0.6) / 200);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: Math.round(110 * k), bottom: Math.round(120 * k), left: Math.round(48 * k), right: Math.round(110 * k) }, animate: false, maxZoom: 12 },
    );
  }, [map, p.fitAll, fires, p.M.units]);

  /* 고른 불이 지도 밖이면 그쪽으로 옮긴다 */
  const selFire = fires.find((f) => f.id === p.selFireId) ?? null;
  useEffect(() => {
    if (!map || !selFire) return;
    const q = map.project([selFire.lon, selFire.lat]);
    const c = map.getContainer();
    if (q.x < 40 || q.y < 80 || q.x > c.clientWidth - 80 || q.y > c.clientHeight - 80) map.easeTo({ center: [selFire.lon, selFire.lat], duration: 600 });
  }, [map, selFire]);

  /* 화면 좌표 배치(목업 frame: 현장 자원 자리 · 경로 · 확산 · 마을) */
  const view = useMemo(() => {
    if (!map) return null;
    const c = map.getContainer();
    const W = c.clientWidth;
    const H = c.clientHeight;
    const P = (la: number, lo: number) => {
      const q = map.project([lo, la]);
      return [q.x, q.y] as [number, number];
    };
    const z = map.getZoom();
    const pxKm = (km: number) => {
      const lat = map.getCenter().lat;
      const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, z));
      return (km * 1000) / mpp;
    };
    const live: Record<string, OpsFire> = {};
    fires.forEach((f) => {
      if (!isClosed(f.status)) live[f.id] = f;
    });
    /* 현장·이동 끝 자리: 불 둘레 40 px 고리, 출동 지시 순서대로 아래쪽부터 */
    const slot: Record<string, [number, number]> = {};
    const per: Record<string, number> = {};
    p.M.units
      .filter((u) => u.fire_id && live[u.fire_id] && (u.status === "enroute" || u.status === "onscene"))
      .sort((a, b) => (w.seq[a.id] ?? 0) - (w.seq[b.id] ?? 0) || (a.id < b.id ? -1 : 1))
      .forEach((u) => {
        const f = live[u.fire_id!]!;
        const i = per[f.id] ?? 0;
        per[f.id] = i + 1;
        const [x, y] = P(f.lat, f.lon);
        const ang = ((90 + 45 * (i % 8)) * Math.PI) / 180;
        const r = 40 + 22 * Math.floor(i / 8);
        slot[u.id] = [x + Math.cos(ang) * r, y + Math.sin(ang) * r];
      });
    const units = p.M.units.map((u) => {
      const tr = w.trips.find((x) => x.unit === u.id && x.kind === "go");
      let xy = slot[u.id] && u.status === "onscene" ? slot[u.id]! : P(u.lat, u.lon);
      if (tr) {
        const a = P(tr.from.lat, tr.from.lon);
        const b = slot[u.id] ?? P(tr.to.lat, tr.to.lon);
        xy = [a[0] + (b[0] - a[0]) * tr.p, a[1] + (b[1] - a[1]) * tr.p];
      }
      return { u, xy };
    });
    const routes = w.trips
      .filter((x) => x.kind === "go")
      .map((x) => ({ from: P(x.from.lat, x.from.lon), to: slot[x.unit] ?? P(x.to.lat, x.to.lon) }));
    const fans = p.layers.spread
      ? Object.values(live)
          .filter((f) => f.spread && DIRS[f.spread] != null)
          .map((f) => {
            const [x, y] = P(f.lat, f.lon);
            const dir = ((DIRS[f.spread!]! - 90) * Math.PI) / 180;
            return { f, x, y, dir, on: f.id === p.selFireId, rr: (h: number) => Math.max(16 * h, pxKm(h)) };
          })
      : [];
    const vils = selFire && p.layers.spread ? selFire.villages.map((v) => ({ v, xy: P(v.lat, v.lon) })) : [];
    const lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, z));
    const m = niceLen(mpp * 190);
    return { W, H, P, units, routes, fans, vils, wide: pxKm(1) >= 34, scale: { px: m / mpp, text: m >= 1000 ? `${m / 1000} km` : `${m} m` } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, frame, fires, p.M.units, w, p.layers.spread, p.selFireId, selFire]);

  /* 현장 도착 자리를 원장에 남길 수 있게 화면 자리를 알린다(목업 OPS.slotOf) */
  useEffect(() => {
    if (!map || !view) return;
    setSlotOf((id) => {
      const it = view.units.find((x) => x.u.id === id);
      if (!it) return null;
      const ll = map.unproject(it.xy);
      return { lat: ll.lat, lon: ll.lng };
    });
    return () => setSlotOf(null);
  }, [map, view]);

  useEffect(() => {
    if (!map || !view) return;
    const feats = p.layers.routes
      ? w.trips
          .filter((x) => x.kind === "go")
          .map((x) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[x.from.lon, x.from.lat], [x.to.lon, x.to.lat]] } }))
      : [];
    (map.getSource("routes") as GeoJSONSource | undefined)?.setData(fc(feats));
  }, [map, view, w.trips, p.layers.routes]);

  const fname = (f: OpsFire) => tl("fire", f.id, "name", f.name);
  const vname = (n: string) => tl("village", n, null, n);
  const wind = tl("weather", "wind", null, p.weather.wind);
  const HALF = (26 * Math.PI) / 180;
  const arc = (x: number, y: number, r: number, a0: number, a1: number) =>
    `M ${x + Math.cos(a0) * r} ${y + Math.sin(a0) * r} A ${r} ${r} 0 0 1 ${x + Math.cos(a1) * r} ${y + Math.sin(a1) * r}`;

  return (
    <div className={cx("op-map map")} data-testid="ops-map">
      <div ref={glEl} className={cx("gl")} />
      {view ? (
        <svg className={cx("ovl")} aria-hidden="true">
          <defs>
            {view.fans.map((fn) => (
              <radialGradient key={fn.f.id} id={`opfan-${fn.f.id}`} cx={fn.x} cy={fn.y} r={Math.max(46, fn.rr(3))} gradientUnits="userSpaceOnUse">
                <stop offset="0.05" stopColor="var(--alert-4)" />
                <stop offset="0.55" stopColor="var(--alert-3)" />
                <stop offset="1" stopColor="var(--alert-3)" stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>
          {view.fans.map((fn) => {
            const r3 = Math.max(46, fn.rr(3));
            const a0 = fn.dir - HALF;
            const a1 = fn.dir + HALF;
            return (
              <g key={fn.f.id}>
                <path d={`M ${fn.x} ${fn.y} L ${fn.x + Math.cos(a0) * r3} ${fn.y + Math.sin(a0) * r3} A ${r3} ${r3} 0 0 1 ${fn.x + Math.cos(a1) * r3} ${fn.y + Math.sin(a1) * r3} Z`} fill={`url(#opfan-${fn.f.id})`} opacity={fn.on ? 0.5 : 0.18} />
                {[1, 2, 3].map((h) => (
                  <path key={h} d={arc(fn.x, fn.y, fn.rr(h), a0, a1)} fill="none" stroke="var(--alert-3)" strokeWidth={fn.on ? 1.2 : 1} strokeDasharray="3 4" opacity={fn.on ? 0.9 : 0.35} />
                ))}
                {fn.on
                  ? [1, 2, 3].map((h) => {
                      const r = fn.rr(h) + 9;
                      return (
                        <text key={h} x={fn.x + Math.cos(a1) * r} y={fn.y + Math.sin(a1) * r} fill="var(--alert-3)" fontSize="11" fontFamily="var(--font-data)" textAnchor="middle" dominantBaseline="middle">
                          {h}h
                        </text>
                      );
                    })
                  : null}
              </g>
            );
          })}
          {view.vils.map(({ v, xy: [vx, vy] }) => (
            <g key={v.name}>
              <path d={`M ${vx} ${vy - 7} L ${vx + 6.5} ${vy - 1.5} L ${vx + 6.5} ${vy + 6} L ${vx - 6.5} ${vy + 6} L ${vx - 6.5} ${vy - 1.5} Z`} fill="var(--surface-0)" stroke="var(--text-1)" strokeWidth={1.6} />
              {view.wide ? (
                <text x={vx + 11} y={vy} fill="var(--text-1)" stroke="var(--surface-0)" strokeWidth={3} paintOrder="stroke" fontSize="11" fontWeight={600} dominantBaseline="middle">
                  {t("ops.vil.homes", { v: vname(v.name), n: v.homes })}
                </text>
              ) : null}
            </g>
          ))}
          {!view.wide && view.vils.length && selFire ? (
            <text
              x={(view.vils[0]?.xy[0] ?? 0) + 14}
              y={(view.vils[0]?.xy[1] ?? 0) + 16}
              fill="var(--text-1)"
              stroke="var(--surface-0)"
              strokeWidth={3}
              paintOrder="stroke"
              fontSize="11"
              fontWeight={600}
            >
              {t("ops.vil.sum", { n: view.vils.length, h: view.vils.reduce((s, x) => s + x.v.homes, 0) })}
            </text>
          ) : null}
        </svg>
      ) : null}
      {view ? (
        <div className={cx("ovl")}>
          {fires.map((f) => {
            const [x, y] = view.P(f.lat, f.lon);
            if (x < -40 || y < -40 || x > view.W + 40 || y > view.H + 40) return null;
            const sel = f.id === p.selFireId;
            return (
              <button
                key={f.id}
                type="button"
                aria-label={fname(f)}
                onClick={() => p.onFire(f.id)}
                style={{ position: "absolute", left: x - 18, top: y - 18, width: 36, height: 36, padding: 0, border: 0, background: "transparent", pointerEvents: "auto", display: "grid", placeItems: "center" }}
              >
                <FireMark f={f} sel={sel} />
                <span
                  style={{
                    position: "absolute",
                    left: 35,
                    top: "50%",
                    transform: "translateY(-50%)",
                    whiteSpace: "nowrap",
                    fontSize: "var(--fs-2)",
                    fontWeight: 600,
                    color: sel ? "var(--text-1)" : "var(--map-label-hi)",
                    textShadow: "0 0 3px var(--surface-0),0 0 3px var(--surface-0),0 0 3px var(--surface-0)",
                  }}
                >
                  {fname(f).split(" ").slice(-2).join(" ")}
                </span>
              </button>
            );
          })}
          {p.layers.units
            ? view.units.map(({ u, xy: [x, y] }) => (
                <button
                  key={u.id}
                  type="button"
                  aria-label={`${tl("unit", u.id, "name", u.name)} · ${t(`shell.unit_status.${u.status}`)}`}
                  onClick={() => p.onUnit(u.id)}
                  style={{
                    position: "absolute",
                    left: x - 11,
                    top: y - 11,
                    width: 22,
                    height: 22,
                    padding: 0,
                    borderRadius: "var(--r-round)",
                    border: "1.5px solid var(--map-halo)",
                    background: UNIT_C[u.status] ?? "var(--text-3)",
                    color: "var(--surface-0)",
                    pointerEvents: "auto",
                    display: "grid",
                    placeItems: "center",
                    ["--ic-btn" as string]: "13px",
                  }}
                >
                  <UnitIcon type={u.type} />
                </button>
              ))
            : null}
        </div>
      ) : null}
      <div className={cx("map-ui")}>
        <div className={cx("op-tr")}>
          <div className={cx("op-wind")} aria-label={t("ops.sel_alert.wind")}>
            <span className={cx("op-wind-dial")}>
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <circle className={cx("op-wind-ring")} cx="20" cy="20" r="17" pathLength={100} strokeDasharray="69 12 100" />
                <g transform={`rotate(${(p.weather.wind_deg + 180) % 360} 20 20)`}>
                  <path d="M20 9 L24.5 22 L20 19.5 L15.5 22 Z" fill="currentColor" />
                  <path d="M20 19.5 V31" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </g>
              </svg>
              <span className={cx("op-wind-n")} aria-hidden="true">
                N
              </span>
            </span>
            <span>
              <b>
                <span className={cx("op-wind-dir")}>{wind.split(" ")[0]} </span>
                {wind.split(" ").slice(1).join(" ")}
              </b>
              <small>{t("ops.wind.station", { s: tl("weather", "station", null, p.weather.station) })}</small>
            </span>
          </div>
          <OpsSwath at={(() => {
            const f = p.M.fires.find((x) => x.id === p.selFireId);
            return f ? ([f.lat, f.lon] as const) : null;
          })()} />
        </div>
        <div className={cx("op-legend")} aria-hidden="true">
          <span>
            <i className={cx("op-pip standby")} />
            {t("ops.off.k.standby")}
          </span>
          <span>
            <i className={cx("op-pip enroute")} />
            {t("ops.ff.enroute")}
          </span>
          <span>
            <i className={cx("op-pip onscene")} />
            {t("ops.sel_alert.on_scene")}
          </span>
          <span>
            <i className={cx("op-pip return")} />
            {t("ops.off.k.return")}
          </span>
          <i className={cx("op-legend-br")} />
          <span className={cx("op-legend-fan")}>{t("ops.sel_alert.spread_1_2_3")}</span>
          <span className={cx("op-legend-vil")}>{t("ops.sel_alert.evacuation_villages")}</span>
          <span className={cx("op-legend-heat")}>{t("ops.sel_alert.today_last_3_days")}</span>
        </div>
        <div className={cx("mtools")} role="toolbar" aria-label={t("shell.map.tools")}>
          <button type="button" data-mt="layers" aria-expanded={pop} aria-haspopup="true" onClick={() => setPop((v) => !v)}>
            <Layers aria-hidden="true" />
            <span>{t("shell.map.layers")}</span>
          </button>
        </div>
        <div className={cx("mtools-pop")} role="group" aria-label={t("shell.map.layers")} hidden={!pop}>
          {(
            [
              ["heat", "ops.sel_alert.hotspots"],
              ["spread", "ops.sel_alert.spread_forecast"],
              ["units", "ops.sel_alert.units"],
              ["routes", "ops.sel_alert.routes"],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              <input type="checkbox" data-k={k} checked={p.layers[k]} onChange={(e) => p.onLayer(k, e.target.checked)} />
              {t(label)}
            </label>
          ))}
        </div>
        <div className={cx("zoom")}>
          <button type="button" data-z="1" aria-label={t("shell.map.zoom_in")} onClick={() => map?.zoomIn()}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" data-z="-1" aria-label={t("shell.map.zoom_out")} onClick={() => map?.zoomOut()}>
            <Minus aria-hidden="true" />
          </button>
          <button
            type="button"
            data-z="fit"
            aria-label={t("shell.map.fit")}
            onClick={() => {
              fitted.current = false;
              setFrame((n) => n + 1);
              if (map) {
                const pts = [...fires, ...p.M.units];
                map.fitBounds(
                  [
                    [Math.min(...pts.map((x) => x.lon)), Math.min(...pts.map((x) => x.lat))],
                    [Math.max(...pts.map((x) => x.lon)), Math.max(...pts.map((x) => x.lat))],
                  ],
                  { padding: 60, maxZoom: 12 },
                );
              }
            }}
          >
            <LocateFixed aria-hidden="true" />
          </button>
        </div>
        <div className={cx("attrib")} title={t("shell.map.attr_kr_full")}>
          {t("shell.map.attr_kr").split("|")[view && view.W < 520 ? 1 : 0]}
        </div>
        {view ? (
          <div className={cx("scale")}>
            <i style={{ width: view.scale.px }} />
            {view.scale.text}
          </div>
        ) : null}
      </div>
      {p.sheet}
    </div>
  );
}

/**
 * 관측폭 칩(목업 ops.js swathCheck): 다음 위성 통과가 15분 안이면 「S-NPP 14:44 통과 예정(12분 후) · 관측폭 안, VIIRS 375 m」.
 * 통과는 entities/satellite-pass(기준점 = 고른 불, 없으면 경북 북부 중심 — 이 화면은 경북 시나리오 목 화면). 통과 정의가 「기준점이 관측폭 절반 안」이라
 * 칩이 뜨면 늘 관측폭 안이다. 목업의 지도 위 관측폭 가장자리 점선은 옮기지 않았다(공통 지도 부품 몫).
 */
const SWATH_MIN = 15;
function OpsSwath({ at }: { at: readonly [number, number] | null }) {
  const t = useT();
  const nowMs = useNowMs();
  const lat = at ? at[0] : 36.6;
  const lon = at ? at[1] : 128.7;
  const min = nowMs != null ? Math.floor(nowMs / 60000) : null;
  const nx = useMemo(() => (min == null ? null : nextPass(min * 60000, [lat, lon])), [min, lat, lon]);
  const left = nx && nowMs != null ? (nx.ms - nowMs) / 60000 : Infinity;
  const on = !!nx && left >= 0 && left <= SWATH_MIN;
  if (!on || !nx) return <div className={cx("op-swath")} hidden />;
  const n = Math.max(0, Math.round(left));
  const d = n < 60 ? t("shell.dur.m", { n }) : n % 60 ? t("shell.dur.hm", { h: Math.floor(n / 60), m: n % 60 }) : t("shell.dur.h", { h: Math.floor(n / 60) });
  const hm = new Date(nx.ms + 9 * 3600e3).toISOString().slice(11, 16);
  return (
    <div className={cx("op-swath")} data-swath="">
      <i className={cx("op-swath-k")} aria-hidden="true" />
      <span>
        <b className={cx("num")}>{`${nx.sat} ${hm}`}</b>
        {t("ops.swath.next", { d })}
        <small>{t("ops.swath.inside", { s: `${nx.sensor} ${nx.sensor === "VIIRS" ? "375 m" : "1 km"}` })}</small>
      </span>
    </div>
  );
}
