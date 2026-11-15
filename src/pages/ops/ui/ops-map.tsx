"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Helicopter, Layers, RadioTower, Truck, Users } from "lucide-react";
import { useLocale } from "next-intl";
import { methodQuery } from "@/entities/release";
import { nextPass, SATS, type Pass } from "@/entities/satellite-pass";
import { useScenarioNowMs } from "@/entities/situation";
import { spreadNowcastQuery } from "@/entities/spread-nowcast";
import { SpreadLegend, SpreadTip, useSpreadLayer } from "@/features/spread-nowcast-layer";
import type { Weather } from "@/shared/agency";
import { useT, useTl } from "@/shared/i18n";
import { api, heavyRetry, heavyRetryDelay, unwrap } from "@/shared/api";
import { adm1RegionsQuery, childRegionsQuery, clusterUnits, MapCanvas, type Bbox, type MapCanvasHandle, type MapHotspot } from "@/widgets/map-canvas";
import { DIRS, isClosed, type OpsFire } from "../model/ops";
import { setSlotOf, useWorld, type Merged } from "../model/store";
import { cx } from "./cx";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
type LayerKey = "heat" | "spread" | "units" | "routes" | "nowcast";

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
  /** 출동 후보로 고른 자원 — 묶음에 넣지 않는다(목업 setUnitCluster keep) */
  pick?: string[];
  /** 출동 지시 직후 맞춤(목업 showTrips): 바뀔 때마다 그 불 + 이번에 나간 자원 출발점 + 마을 + 확산 3h 끝이 한 화면에 */
  tripsFit?: { fire: string; n: number } | null;
}

/* 이름표 글자 폭(목업 textW · fPin = 600 fs-2) */
let measureCtx: CanvasRenderingContext2D | null = null;
function textW(t: string, font: string): number {
  if (typeof document === "undefined") return t.length * 7;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return t.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(t).width;
}
type Bx = { x0: number; y0: number; x1: number; y1: number };
const bx = (x0: number, y0: number, x1: number, y1: number): Bx => ({ x0, y0, x1, y1 });
const hitB = (p: Bx, q: Bx) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
const hitsB = (r: Bx, list: Bx[]) => list.reduce((n, q) => n + (hitB(r, q) ? 1 : 0), 0);

/* ── 다음 통과 관측폭 가장자리선(목업 ops.js swathOf — 태양동기 궤도 지방시 근사) ── */
const NODE_LST: Record<string, [number, number]> = { Terra: [10.5, 22.5] };
const NODE_LST_PM: [number, number] = [13.5, 1.5];
const INC = (98.7 * Math.PI) / 180;
function dest(lat: number, lon: number, brg: number, km: number) {
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const b = (brg * Math.PI) / 180;
  const d = km / 6371;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: (p2 * 180) / Math.PI, lon: (((l2 * 180) / Math.PI + 540) % 360) - 180 };
}
export function swathOf(p: Pass, lat0: number, lon0: number) {
  const utcH = (((p.ms / 3600e3) % 24) + 24) % 24;
  /* 통과가 낮인지(현지 태양시 6–18시) — 목업은 통과 행의 node 를 썼고 여기 통과 행에는 없어 같은 기준으로 셈 */
  const solar = (((utcH + lon0 / 15) % 24) + 24) % 24;
  const node = solar >= 6 && solar < 18 ? 0 : 1;
  const lst = (NODE_LST[p.sat] ?? NODE_LST_PM)[node]!;
  const lonN = ((((lst - utcH) * 15 + 540) % 360) + 360) % 360 - 180;
  const asc = (p.sat === "Terra") === (node === 1);
  const h0 = (Math.asin(Math.max(-1, Math.min(1, Math.cos(INC) / Math.cos((lat0 * Math.PI) / 180)))) * 180) / Math.PI;
  const head = asc ? h0 : 180 - h0;
  const half = (SATS.find((x) => x.sat === p.sat)?.swath_km ?? 0) / 2;
  const edge = (sg: number) => {
    const c = dest(lat0, lonN, head + sg * 90, half);
    const pts: { lat: number; lon: number }[] = [];
    for (let k = -40; k <= 40; k++) pts.push(dest(c.lat, c.lon, head, k * 20));
    return pts;
  };
  return { lonN, head, edges: [edge(-1), edge(1)] };
}
/* 지도 최대 범위에 여유를 둔 상자(목업 VIEW_BOX): 이 안의 점만 잇는다 */
const VIEW_BOX = { s: 35.0, n: 38.3, w: 126.4, e: 131.1 };
const inBox = (q: { lat: number; lon: number }) => q.lat >= VIEW_BOX.s && q.lat <= VIEW_BOX.n && q.lon >= VIEW_BOX.w && q.lon <= VIEW_BOX.e;
const SWATH_MIN = 15;

/** 다음 통과(15분 안이면) — 칩과 가장자리선이 같은 값을 쓴다 */
function useSwath(at: readonly [number, number] | null) {
  const nowMs = useScenarioNowMs();
  const lat = at ? at[0] : 36.6;
  const lon = at ? at[1] : 128.7;
  const min = nowMs != null ? Math.floor(nowMs / 60000) : null;
  const nx = useMemo(() => (min == null ? null : nextPass(min * 60000, [lat, lon])), [min, lat, lon]);
  const left = nx && nowMs != null ? (nx.ms - nowMs) / 60000 : Infinity;
  const on = !!nx && left >= 0 && left <= SWATH_MIN;
  const geo = useMemo(() => (on && nx ? swathOf(nx, lat, lon) : null), [on, nx, lat, lon]);
  return { nx: on ? nx : null, left, geo, lat, lon };
}

type HotRow = { latitude: number; longitude: number; instrument: string; frp: number | null; confidence: string; date_local: string; acq_datetime_utc: string };
/* 열 지도 점(목업 hotNow): 실제 /hotspots(지도 범위 · 지난 3일) — 오늘 점이 아닌 것은 흐리게(FRP ×0.22 · 낮은 신뢰도) */
const hotQuery = (bbox: Bbox | null, start: string, end: string) => ({
  queryKey: ["hotspots", "ops-heat", bbox, start, end] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    api
      .GET("/hotspots", { params: { query: { bbox: [...bbox!], start, end, layer: "all", limit: 5000 } }, querySerializer: { array: { style: "form", explode: false } }, signal })
      .then(unwrap) as unknown as Promise<{ hotspots?: HotRow[] }>,
  enabled: !!bbox && !!start,
  staleTime: 10 * 60 * 1000,
  /* 실서버 heavy 한도(429): Retry-After 만큼 기다려 다시 — 예전엔 retry:false 라 한국 경보·출동 지도의 실제 점이 429 하나로 비었다(잰 것 2026-11-15) */
  retry: heavyRetry,
  retryDelay: heavyRetryDelay,
});
const addDay = (d: string, k: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
};

/**
 * 경보·출동 지도 — MapLibre 2D(결정 F9). 목업 ops.js 지도 몫:
 * 경계 · 불 표지(조준 고리) + 이름 · 자원 표지(상태색 원 + 종류 아이콘, 현장 자원은 불 둘레 자리) · 출동 경로(점선 + 이동 중 위치) ·
 * 확산 부채꼴(1·2·3h 고리, 고른 불 진하게) · 반경 2 km 마을(집 표지 + 이름·가구) · 바람 묶음 · 범례 · 레이어 · 확대/축소/전체 · 축척 · 출처.
 * 열 지도(오늘 = 시나리오 불 관측 점, 지난 3일 = 실제 /hotspots 흐리게) · 자원 묶음(눌러 확대) · 화점 이름표 좌우 비키기 · 화면 밖 표지 칩(눌러 전체 보기) ·
 * 다음 통과 관측폭 가장자리선(15분 안) · 출동 직후 맞춤(showTrips). 못 옮긴 것: 3D 지형.
 */
export function OpsMap(p: OpsMapProps) {
  const t = useT();
  const tl = useTl();
  const w = useWorld();
  const ref = useRef<MapCanvasHandle>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [frame, setFrame] = useState(0);
  const [pop, setPop] = useState(false);
  const [fitN, setFitN] = useState(0);
  const nowMs = useScenarioNowMs();
  /* 바탕 경계 = 시나리오 시도(경상북도)의 시군구(실제 API 경계) · 스냅숏(MSW)은 나라 1급 */
  const lang = useLocale();
  const mv = useQuery(methodQuery()).data?.method_version ?? null;
  const kids = useQuery(childRegionsQuery("SIDO_47", lang, mv)).data;
  const adm1 = useQuery(adm1RegionsQuery("KOR", lang)).data;
  const regions = kids?.length ? kids : (adm1 ?? []);
  const onReady = useCallback((m: MlMap) => {
    m.addSource("op-routes", { type: "geojson", data: fc([]) });
    m.addLayer({ id: "op-routes", type: "line", source: "op-routes", paint: { "line-color": tok("route"), "line-width": 2, "line-dasharray": [2, 2] } });
    setMap(m);
  }, []);

  /* 확산 nowcast(실제 release spread_nowcast_latest — 결정 F15): 한국 경계 안 칸(aoi_id=KR). 시나리오 불의 목 확산 부채꼴(spread)과 따로 켜고 끈다 */
  const ncQ = useQuery(spreadNowcastQuery("KR", mv));
  const nc = useSpreadLayer(map, ncQ.data, p.layers.nowcast);

  const fires = useMemo(() => p.M.fires.filter((f) => !f.historical && (f.current || !isClosed(f.status))), [p.M.fires]);

  /* 첫 화면 · 개수 띠 「출동·대기」: 오늘 불 전체와 모든 자원이 지도 안(떠 있는 묶음 아래)에 들게 맞춘다 */
  const fitted = useRef(false);
  /* 화면 밖 칩을 누르면 전체 보기(오늘 불 전체와 모든 자원) — 누른 횟수가 바뀔 때 한 번 */
  const fitDone = useRef(0);
  useEffect(() => {
    if (!map) return;
    if (fitted.current && !p.fitAll && fitN === fitDone.current) return;
    fitted.current = true;
    fitDone.current = fitN;
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
  }, [map, p.fitAll, fires, p.M.units, fitN]);

  /* 출동 지시 직후(목업 showTrips): 불 + 이번에 나간 자원 출발점 + 마을 + 확산 3h 끝 */
  const tf = p.tripsFit;
  useEffect(() => {
    if (!map || !tf) return;
    const f = p.M.fires.find((x) => x.id === tf.fire);
    if (!f) return;
    const ps: { lat: number; lon: number }[] = [f, ...w.trips.filter((x) => x.kind === "go" && x.fire === f.id).map((x) => x.from), ...f.villages];
    const d = f.spread ? DIRS[f.spread] : undefined;
    if (d != null) {
      const r = (d * Math.PI) / 180;
      ps.push({ lat: f.lat + (Math.cos(r) * 3) / 111, lon: f.lon + (Math.sin(r) * 3) / (111 * Math.cos((f.lat * Math.PI) / 180)) });
    }
    const lats = ps.map((x) => x.lat);
    const lons = ps.map((x) => x.lon);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 84, bottom: 70, left: 56, right: 64 }, duration: reduce ? 0 : 700, maxZoom: 13 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, tf?.fire, tf?.n]);

  /* 전체 보기 = 처음 받은 오늘 불·자원 전체 범위(자원이 움직일 때마다 공통 지도가 다시 맞추지 않게 한 번만 정한다) */
  const [allView, setAllView] = useState<Bbox | null>(null);
  if (!allView) {
    const pts = [...fires, ...p.M.units];
    if (pts.length) setAllView([Math.min(...pts.map((x) => x.lon)) - 0.02, Math.min(...pts.map((x) => x.lat)) - 0.02, Math.max(...pts.map((x) => x.lon)) + 0.02, Math.max(...pts.map((x) => x.lat)) + 0.02]);
  }

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
    /* 자원 묶음(목업 setUnitCluster · 셸 _ucPass): 화면 중심 거리 44 px 안이면 한 무리, 대표 표지 하나 + 개수. 이동 중·고른 자원은 묶지 않는다 */
    const keep = new Set(p.pick ?? []);
    const groups = clusterUnits(
      units.map(({ u, xy: [x, y] }) => ({ id: u.id, x, y, status: u.status, free: u.status === "enroute" || keep.has(u.id) })),
      44,
    );
    const cl: Record<string, { rep: string; ids: string[] }> = {};
    groups.forEach((g) => g.ids.forEach((id) => (cl[id] = g)));
    /* 화점 이름표 자리(목업 geometry G.pinSide): 오른쪽 → 왼쪽 → (고르지 않은 불은) 숨김. 고른 불이 먼저 자리를 잡는다 */
    const font = `600 ${parseFloat(tok("fs-2")) || 12}px ${tok("font-body") || "sans-serif"}`;
    const fp = fires.map((f) => {
      const [x, y] = P(f.lat, f.lon);
      return { f, x, y, b: bx(x - 18, y - 18, x + 18, y + 18) };
    });
    const ub = units.filter(({ u }) => !cl[u.id] || cl[u.id]!.rep === u.id).map(({ xy: [x, y] }) => bx(x - 11, y - 11, x + 11, y + 11));
    const taken: Bx[] = [];
    const side: Record<string, "r" | "l" | "x"> = {};
    fp.slice()
      .sort((a, b) => Number(b.f.id === p.selFireId) - Number(a.f.id === p.selFireId))
      .forEach((q) => {
        const wd = textW(tl("fire", q.f.id, "name", q.f.name).split(" ").slice(-2).join(" "), font);
        const others = fp.filter((o) => o !== q).map((o) => o.b).concat(taken, ub);
        const R = bx(q.x + 17, q.y - 9, q.x + 17 + wd, q.y + 9);
        const L = bx(q.x - 21 - wd, q.y - 9, q.x - 21, q.y + 9);
        const pad = (b: Bx) => bx(b.x0 - 4, b.y0 - 4, b.x1 + 4, b.y1 + 4);
        const sd = !hitsB(pad(R), others) ? "r" : !hitsB(pad(L), others) ? "l" : q.f.id === p.selFireId ? "r" : "x";
        side[q.f.id] = sd;
        if (sd !== "x") taken.push(sd === "l" ? L : R);
      });
    return { W, H, P, units, routes, fans, vils, wide: pxKm(1) >= 34, cl, side };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, frame, fires, p.M.units, w, p.layers.spread, p.selFireId, selFire, p.pick]);

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
    (map.getSource("op-routes") as GeoJSONSource | undefined)?.setData(fc(feats));
  }, [map, view, w.trips, p.layers.routes]);

  const fname = (f: OpsFire) => tl("fire", f.id, "name", f.name);

  /* 열 지도·점(목업 hotNow · HOT_FROM = 오늘 − 3일): 오늘 = 시나리오 불 관측 점 그대로, 지난 3일 = 실제 /hotspots 흐리게 */
  const today = nowMs != null ? new Date(nowMs + 9 * 3600e3).toISOString().slice(0, 10) : "";
  const heatBox = useMemo<Bbox | null>(() => (allView ? [allView[0] - 0.3, allView[1] - 0.3, allView[2] + 0.3, allView[3] + 0.3] : null), [allView]);
  const hq = useQuery(hotQuery(heatBox, today ? addDay(today, -3) : "", today));
  const hot = useMemo<MapHotspot[]>(() => {
    const live: MapHotspot[] = fires.flatMap((f) => (f.xy ?? []).map((h) => ({ lat: h.lat, lon: h.lon, sensor: h.sensor, frp: h.frp, conf: h.conf, time: f.detected_at.slice(11) })));
    const bg: MapHotspot[] = (hq.data?.hotspots ?? []).map((h) =>
      h.date_local === today
        ? { lat: h.latitude, lon: h.longitude, sensor: h.instrument, frp: h.frp, conf: h.confidence, time: h.acq_datetime_utc.slice(11, 16) }
        : { lat: h.latitude, lon: h.longitude, sensor: h.instrument, frp: (h.frp ?? 1) * 0.22, conf: "l", time: h.date_local },
    );
    return [...live, ...bg];
  }, [fires, hq.data, today]);
  const vname = (n: string) => tl("village", n, null, n);
  const wind = tl("weather", "wind", null, p.weather.wind);
  const sw = useSwath(selFire ? ([selFire.lat, selFire.lon] as const) : null);
  const HALF = (26 * Math.PI) / 180;
  const arc = (x: number, y: number, r: number, a0: number, a1: number) =>
    `M ${x + Math.cos(a0) * r} ${y + Math.sin(a0) * r} A ${r} ${r} 0 0 1 ${x + Math.cos(a1) * r} ${y + Math.sin(a1) * r}`;

  return (
    <MapCanvas
      ref={ref}
      className={cx("op-map map")}
      testId="ops-map"
      iso3="KOR"
      view={allView}
      regions={regions}
      hotspots={hot}
      layers={{ heat: p.layers.heat, hotspots: p.layers.heat, fires: false, units: false, routes: false }}
      onReady={onReady}
      onMove={() => setFrame((n) => n + 1)}
      ticks
    >
      {view ? (
        <svg className={cx("ovl")} aria-hidden="true" style={{ pointerEvents: "none" }}>
          <defs>
            {view.fans.map((fn) => (
              <radialGradient key={fn.f.id} id={`opfan-${fn.f.id}`} cx={fn.x} cy={fn.y} r={Math.max(46, fn.rr(3))} gradientUnits="userSpaceOnUse">
                <stop offset="0.05" stopColor="var(--alert-4)" />
                <stop offset="0.55" stopColor="var(--alert-3)" />
                <stop offset="1" stopColor="var(--alert-3)" stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>
          {sw.geo
            ? sw.geo.edges.map((pts, i) => {
                let d = "";
                let pen = false;
                pts.forEach((q) => {
                  if (!inBox(q)) {
                    pen = false;
                    return;
                  }
                  const [x, y] = view.P(q.lat, q.lon);
                  if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    pen = false;
                    return;
                  }
                  d += `${pen ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)} `;
                  pen = true;
                });
                return d ? <path key={i} d={d} fill="none" stroke="var(--cosmo-orbit)" strokeWidth={1} strokeDasharray="4 4" data-swath-edge="" /> : null;
              })
            : null}
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
        <div className={cx("ovl")} style={{ pointerEvents: "none" }}>
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
                  data-lbl={view.side[f.id] ?? "r"}
                  hidden={view.side[f.id] === "x"}
                  style={{
                    position: "absolute",
                    ...(view.side[f.id] === "l" ? { right: 39, textAlign: "right" as const } : { left: 35 }),
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
            ? view.units.map(({ u, xy: [x, y] }) => {
                const g = view.cl[u.id];
                if (g && g.rep !== u.id) return null;
                const cnt: Record<string, number> = {};
                g?.ids.forEach((id) => {
                  const st = p.M.units.find((q) => q.id === id)?.status ?? "standby";
                  cnt[st] = (cnt[st] ?? 0) + 1;
                });
                const clLabel = g
                  ? t("shell.map.units_cl", {
                      n: g.ids.length,
                      s: ["onscene", "return", "standby"]
                        .filter((k) => cnt[k])
                        .map((k) => `${t(`shell.unit_status.${k}`)} ${cnt[k]}`)
                        .join(", "),
                    })
                  : null;
                return (
                <button
                  key={u.id}
                  type="button"
                  data-unit={u.id}
                  data-cl={g ? g.ids.length : undefined}
                  aria-label={clLabel ?? `${tl("unit", u.id, "name", u.name)} · ${t(`shell.unit_status.${u.status}`)}`}
                  onClick={() => {
                    if (!g) return p.onUnit(u.id);
                    /* 묶음: 무리 가운데로, 가장 가까운 두 표지가 누르는 영역만큼 벌어지는 줌으로 한 번에(셸 묶음 누르기와 같은 셈) */
                    const us = p.M.units.filter((q) => g.ids.includes(q.id));
                    if (!map || !us.length) return;
                    const px = us.map((q) => map.project([q.lon, q.lat]));
                    let dmin = Infinity;
                    for (let i = 0; i < px.length; i++) for (let j = i + 1; j < px.length; j++) dmin = Math.min(dmin, Math.hypot(px[i]!.x - px[j]!.x, px[i]!.y - px[j]!.y));
                    const dz = Math.max(1, Math.log2(56 / Math.max(1, dmin)));
                    map.jumpTo({ center: [us.reduce((a, q) => a + q.lon, 0) / us.length, us.reduce((a, q) => a + q.lat, 0) / us.length], zoom: Math.min(map.getMaxZoom(), map.getZoom() + dz) });
                  }}
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
                  {g ? (
                    <b
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        right: "calc(-1 * var(--sp-2))",
                        top: "calc(-1 * var(--sp-2))",
                        minWidth: 18,
                        height: 18,
                        padding: "0 var(--sp-1)",
                        borderRadius: "var(--r-2xs)",
                        background: "var(--marker-bg, var(--surface-1))",
                        border: `1.5px solid ${UNIT_C[u.status] ?? "var(--text-3)"}`,
                        color: "var(--text-1)",
                        fontSize: "var(--fs-1)",
                        fontWeight: 700,
                        lineHeight: "15px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {g.ids.length}
                    </b>
                  ) : null}
                </button>
                );
              })
            : null}
        </div>
      ) : null}
      <div className={cx("map-ui")} style={{ pointerEvents: "none" }}>
        {view ? <OffChips view={view} fires={fires} units={p.layers.units} onFit={() => setFitN((n) => n + 1)} /> : null}
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
          <OpsSwath sw={sw} />
          {p.layers.nowcast ? <SpreadLegend data={ncQ.data} pending={ncQ.isPending} error={ncQ.isError} /> : null}
        </div>
        <SpreadTip hover={nc.hover} />
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
              ["nowcast", "shell.nowcast.layer"],
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
      </div>
      {p.sheet}
    </MapCanvas>
  );
}

/**
 * 관측폭 칩(목업 ops.js swathCheck): 다음 위성 통과가 15분 안이면 「S-NPP 14:44 통과 예정(12분 후) · 관측폭 안, VIIRS 375 m」.
 * 통과는 entities/satellite-pass(기준점 = 고른 불, 없으면 경북 북부 중심 — 이 화면은 경북 시나리오 목 화면).
 * 관측폭 안 여부는 목업처럼 중심선 경도 차를 km 로 바꿔 절반 폭과 견준다(가로 근사). 지도 위 가장자리 점선은 OpsMap 덧그림.
 */
function OpsSwath({ sw }: { sw: ReturnType<typeof useSwath> }) {
  const t = useT();
  const { nx, left, geo, lat, lon } = sw;
  if (!nx || !geo) return <div className={cx("op-swath")} hidden />;
  const n = Math.max(0, Math.round(left));
  const d = n < 60 ? t("shell.dur.m", { n }) : n % 60 ? t("shell.dur.hm", { h: Math.floor(n / 60), m: n % 60 }) : t("shell.dur.h", { h: Math.floor(n / 60) });
  const hm = new Date(nx.ms + 9 * 3600e3).toISOString().slice(11, 16);
  const offKm = Math.abs(((lon - geo.lonN + 540) % 360) - 180) * 111.32 * Math.cos((lat * Math.PI) / 180) * Math.cos((geo.head * Math.PI) / 180);
  const inside = Math.abs(offKm) <= (SATS.find((x) => x.sat === nx.sat)?.swath_km ?? 0) / 2;
  return (
    <div className={cx("op-swath")} data-swath="">
      <i className={cx("op-swath-k")} aria-hidden="true" />
      <span>
        <b className={cx("num")}>{`${nx.sat} ${hm}`}</b>
        {t("ops.swath.next", { d })}
        {inside ? <small>{t("ops.swath.inside", { s: `${nx.sensor} ${nx.sensor === "VIIRS" ? "375 m" : "1 km"}` })}</small> : null}
      </span>
    </div>
  );
}

/**
 * 화면 밖 표지 칩(목업 ops.js offChips): 지도 칸 밖으로 나간 자원·불을 그 방향 가장자리에 「화살표 + 종류별 수」로 묶어 알린다(가장자리마다 하나).
 * 위 떠 있는 묶음 아래 ~ 범례 위 띠 안. 누르면 전체 보기(오늘 불 전체와 모든 자원).
 * 목업의 표지·이름표 덮음 넓이 최소화 자리 찾기는 옮기지 않고, 방향 무게중심 자리를 띠 안으로 자른다.
 */
const OFF_ORDER = ["fire", "dispatched", "standby", "return"] as const;
type OffK = (typeof OFF_ORDER)[number];
function OffChips({
  view,
  fires,
  units,
  onFit,
}: {
  view: { W: number; H: number; P: (la: number, lo: number) => [number, number]; units: { u: { id: string; status: string }; xy: [number, number] }[] };
  fires: OpsFire[];
  units: boolean;
  onFit: () => void;
}) {
  const t = useT();
  const { W, H } = view;
  if (!W) return null;
  const cxm = W / 2;
  const cym = H / 2;
  const items: { k: OffK; x: number; y: number }[] = [];
  if (units) view.units.forEach(({ u, xy: [x, y] }) => items.push({ k: u.status === "standby" ? "standby" : u.status === "return" ? "return" : "dispatched", x, y }));
  fires.forEach((f) => {
    const [x, y] = view.P(f.lat, f.lon);
    items.push({ k: "fire", x, y });
  });
  const sides: Record<string, { n: Partial<Record<OffK, number>>; sx: number; sy: number; ax: number; ay: number; c: number }> = {};
  items.forEach((q) => {
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return;
    if (q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H) return;
    const dx = q.x - cxm;
    const dy = q.y - cym;
    const k = Math.min(Math.abs(dx) > 0.01 ? W / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 0.01 ? H / 2 / Math.abs(dy) : Infinity);
    const s = Math.abs(dx) * H >= Math.abs(dy) * W ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t";
    const g = (sides[s] ??= { n: {}, sx: 0, sy: 0, ax: 0, ay: 0, c: 0 });
    g.n[q.k] = (g.n[q.k] ?? 0) + 1;
    g.sx += cxm + dx * k;
    g.sy += cym + dy * k;
    const hl = Math.hypot(dx, dy) || 1;
    g.ax += dx / hl;
    g.ay += dy / hl;
    g.c++;
  });
  const SIDE: Record<string, string> = { r: t("ops.sync.right"), l: t("ops.sync.left"), t: t("ops.sync.top"), b: t("ops.sync.bottom") };
  const topY = 64;
  const botY = H - 64;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return (
    <div className={cx("op-off")} data-testid="ops-off">
      {Object.keys(sides)
        .sort()
        .map((s) => {
          const g = sides[s]!;
          const txt = OFF_ORDER.filter((k) => g.n[k]).map((k) => `${t(`ops.off.k.${k}`)} ${g.n[k]}`);
          const say = OFF_ORDER.filter((k) => g.n[k]).map((k) => (k === "fire" ? t("ops.off.say_fire", { n: g.n[k]! }) : t("ops.off.say_unit", { k: t(`ops.off.k.${k}`), n: g.n[k]! })));
          const px = g.sx / g.c;
          const py = g.sy / g.c;
          const deg = Math.round((Math.atan2(g.ay, g.ax) * 180) / Math.PI);
          const pos: CSSProperties =
            s === "r"
              ? { left: "auto", right: 64, top: clamp(py, topY, botY - 96), transform: "translateY(-50%)" }
              : s === "l"
                ? { left: 12, top: clamp(py, topY, botY), transform: "translateY(-50%)" }
                : s === "t"
                  ? { left: clamp(px, 120, W - 160), top: topY, transform: "translateX(-50%)" }
                  : { left: clamp(px, 120, W - 220), top: "auto", bottom: 108, transform: "translateX(-50%)" }; // 아래 = 범례(두 줄)·출처 위
          return (
            <button key={s} type="button" className={cx("chip op-off-chip")} data-side={s} aria-label={t("ops.off.aria", { side: SIDE[s] ?? s, what: say.join(", ") })} onClick={onFit} style={pos}>
              <span className={cx("op-off-ar")} aria-hidden="true" style={{ transform: `rotate(${deg}deg)` }}>
                <ChevronRight style={{ width: "var(--ic-inline)", height: "var(--ic-inline)" }} />
              </span>
              <span className={cx("tn")}>{t("ops.off.chip", { what: txt.join(", ") })}</span>
            </button>
          );
        })}
    </div>
  );
}
