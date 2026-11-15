"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { ChevronRight, Play, Square, X } from "lucide-react";
import { countryName, pickableIso3, useCountry } from "@/entities/country";
import { aoiIndexQuery } from "@/features/pick-aoi";
import { worldGridQuery, type LatBand, type WorldMeta } from "@/entities/world-grid";
import { useT } from "@/shared/i18n";
import { aoiOfIso3 } from "@/shared/lib/adm0";
import { boxBounds, CELL_OPACITY, radiusExpr, stepColorExpr, stepOf, stepOfCell, useStepColors } from "@/shared/lib/display";
import { MapKey, MapLoading } from "@/shared/ui";
import cj from "./continent-jump.module.css";
import lbl from "./map-labels.module.css";
import hud from "./map-hud.module.css";

/* 대륙 바로 가기(프런트 UI/UX, 2026-11-15): 지도 아래쪽에 한 줄로 고정. 누르면 그 대륙 상자로 이동하고 단추가 검게 바뀐다. 상자 = [서, 남, 동, 북] */
const CONTINENTS = [
  { id: "na", ko: "북아메리카", en: "North America", color: "#e63946", box: [-168, 7, -52, 72] },
  { id: "sa", ko: "남아메리카", en: "South America", color: "#5cb85c", box: [-82, -56, -34, 13] },
  { id: "eu", ko: "유럽", en: "Europe", color: "#3b8fe0", box: [-25, 34, 45, 71] },
  { id: "af", ko: "아프리카", en: "Africa", color: "#f28c28", box: [-18, -35, 52, 38] },
  { id: "as", ko: "아시아", en: "Asia", color: "#f5c518", box: [40, -11, 150, 60] },
  { id: "oc", ko: "오세아니아", en: "Oceania", color: "#9b7fe6", box: [110, -48, 180, 0] },
] as const;
type ContinentId = (typeof CONTINENTS)[number]["id"];

/* 지도 이름표(프런트 UI/UX, 2026-11-15): 대륙(굵게)·바다(기울임) 이름을 그 중앙 [경도, 위도]에 MapLibre Marker 로 붙인다.
   Marker 는 지도를 그리는 같은 프레임에 정수 픽셀 transform 으로 움직여서 떨리지 않는다. 한국어 화면 = 한국어, 그 밖 = 영어. 누름은 지도로 통과 */
const MAP_LABELS = [
  { id: "na", kind: "land", ko: "북아메리카", en: "North America", at: [-100, 47] },
  { id: "sa", kind: "land", ko: "남아메리카", en: "South America", at: [-60, -12] },
  { id: "eu", kind: "land", ko: "유럽", en: "Europe", at: [18, 52] },
  { id: "af", kind: "land", ko: "아프리카", en: "Africa", at: [20, 6] },
  { id: "as", kind: "land", ko: "아시아", en: "Asia", at: [90, 48] },
  { id: "oc", kind: "land", ko: "오세아니아", en: "Oceania", at: [134, -25] },
  { id: "pac", kind: "sea", ko: "태평양", en: "Pacific Ocean", at: [-118, -8] },
  { id: "atl", kind: "sea", ko: "대서양", en: "Atlantic Ocean", at: [-38, 22] },
  { id: "ind", kind: "sea", ko: "인도양", en: "Indian Ocean", at: [78, -22] },
] as const;

/* 작은 도우미(화면 슬라이스 import 없이 — 캘린더 model/calendar 와 같은 규칙) */
const p2 = (n: number) => String(n).padStart(2, "0");
const ymIso = (y: number, m: number) => `${y}-${p2(m)}`;
const ymOfIndex = (i: number): [number, number] => [2000 + Math.floor((10 + i) / 12), ((10 + i) % 12) + 1];
const ymWord = (lang: string, y: number, m: number) => (lang === "ko" ? `${y}년 ${m}월` : new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }));
const nfC = new Map<string, Intl.NumberFormat>();
const intl = (lang: string, key: string, o: Intl.NumberFormatOptions) => {
  const k = `${lang}|${key}`;
  let f = nfC.get(k);
  if (!f) {
    f = new Intl.NumberFormat(lang === "ko" ? "ko-KR" : lang, o);
    nfC.set(k, f);
  }
  return f;
};
function fmtNum(lang: string, n: number | null | undefined, d = 0) {
  if (n == null || Number.isNaN(n)) return "–";
  return intl(lang, `n${d}`, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n));
}
function fmtCompact(lang: string, n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "";
  const a = Math.abs(n);
  if (a > 0 && a < 0.05) return `<${fmtNum(lang, 0.1, 1)}`;
  if (a < 1000) return a < 10 && !Number.isInteger(+n) ? fmtNum(lang, n, 1) : fmtNum(lang, Math.round(n));
  return intl(lang, "c", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n));
}
/* 지운 지도(remove 뒤)를 쓰지 않게 — 개발 중 핫 리로드 때 effect 가 지운 지도로 한 번 더 돌아 getSource 오류로 화면이 깨지던 것 */
const alive = (m: MlMap | null): m is MlMap => !!m && !(m as unknown as { _removed?: boolean })._removed;
const tok = (name: string) => (typeof window === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim());

/**
 * 전 세계 1° 월별 재생(목업 worldgrid.js EM.worldFire) — 정적 world-1deg(grid.bin · meta.json · lat-band.json).
 * MapLibre 2D 위 캔버스 원천 하나. 1° 칸을 칸 중심 원으로(F9): 색 = 로그 눈금(1 … 10,000), 크기 = 값 단계 5개. 값 0 칸은 그리지 않는다.
 * 「달 합계」는 meta.total(0.1° 칸 value 의 정확한 합) — 복원한 1° 칸을 더한 수는 쓰지 않는다.
 * 진행 중 달(meta.partial)은 total = as_of_date 까지 누계, total_projected = 달 전체 추정.
 * 캘린더(전 세계 모드·지도)와 비교 분석 S1(목업 analysis.js mountWorld) 두 화면이 같이 쓴다.
 * 모양(CSS 모듈 cx)·상태 표지·낱말 묶음(ns)·나라 행 질의는 쓰는 화면이 넘긴다 — 화면마다 제 CSS 그대로.
 */
const LAT_N = 80;
const LAT_S = -60;
const CW = 1440;
const PXD = 4;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const PXR = CW / (2 * Math.PI);
const MY0 = merc(LAT_N);
const CH = Math.round((MY0 - merc(LAT_S)) * PXR);
const yOf = (lat: number) => Math.round((MY0 - merc(Math.max(LAT_S, Math.min(LAT_N, lat)))) * PXR);
const NM = 313;
const SPEEDS = [1, 2, 4];
const VS_CLS: Record<string, string> = { modis_m2v_terra: "as", modis_m2v: "as", snpp_observed: "va", n20_bridge: "af" };
const ymS = (i: number) => {
  const [y, m] = ymOfIndex(i);
  return ymIso(y, m);
};
const mi = (y: number, m: number) => (y - 2000) * 12 + m - 11;

interface Prep {
  meta: WorldMeta;
  band: LatBand;
  n: number;
  bpm: number;
  u8: Uint8Array;
  off: number[];
  bx: Int16Array;
  by0: Int16Array;
  /** 칸 남쪽 위도(°) */
  la: Int16Array;
  dq: Float32Array;
}
function prep(meta: WorldMeta, buf: ArrayBuffer, band: LatBand): Prep {
  const n = meta.n_active;
  const bpm = meta.bitmap_bytes_per_month;
  const u8 = new Uint8Array(buf);
  const act = new Uint16Array(buf, 0, n);
  const off = [n * 2 + NM * bpm];
  meta.counts.forEach((c, k) => off.push((off[k] as number) + c));
  const bx = new Int16Array(n);
  const by0 = new Int16Array(n);
  const las = new Int16Array(n);
  for (let k = 0; k < n; k++) {
    const g = act[k] as number;
    const la = Math.floor(g / 360) - 90;
    const lo = (g % 360) - 180;
    bx[k] = (lo + 180) * PXD + PXD / 2;
    by0[k] = yOf(la + 0.5);
    las[k] = la;
  }
  const dq = new Float32Array(256);
  for (let q = 1; q < 256; q++) dq[q] = Math.exp(meta.quant.lnmin + ((q - 1) / 254) * (meta.quant.lnmax - meta.quant.lnmin));
  return { meta, band, n, bpm, u8, off, bx, by0, la: las, dq };
}

export interface WorldReplayProps {
  month: number | null;
  onMonth?: (i: number) => void;
  onCountry?: (iso3: string, i: number) => void;
  /** 판(method_version) — 누른 나라의 캘린더 행(/aois/{ADM0}/calendar)을 받는 키 */
  mv: string | null;
  partialLine: (o: { d: string; v: string; p: string }) => string;
  /** 쓰는 화면의 CSS 모듈 이름 바꾸기(목업 클래스 이름 → 모듈 이름) */
  cx: (...names: (string | false | null | undefined)[]) => string;
  Status: ComponentType<{ st: string | null | undefined }>;
  Verdict: ComponentType<{ v: string | null | undefined }>;
  /** 낱말 묶음 — 캘린더 "calendar.w" · 분석 "analysis.w1" */
  ns: string;
  /** 누른 나라의 캘린더 행(/aois/{ADM0}/calendar) 질의 */
  rowsQuery: (aoiId: string, mv: string | null) => { queryKey: readonly unknown[]; queryFn?: unknown };
}
export interface WorldRows {
  months: { year: number; month: number; value?: number | null; verdict?: string | null; status?: string | null }[];
}

export function WorldReplay(o: WorldReplayProps) {
  const t = useT();
  const { cx, Status, Verdict } = o;
  const T = (k: string, v?: Record<string, string | number>) => t(`${o.ns}.${k}`, v);
  const lang = useLocale();
  const { list: countries } = useCountry();
  const { data, isError } = useQuery(worldGridQuery());
  const D = useMemo(() => (data ? prep(data.meta, data.buf, data.band) : null), [data]);
  /* 단계 색 5개(R4) — 모든 지도와 같은 색 · 같은 경계(0.1° 칸당 0.1 · 1 · 10 · 100, 1° 칸은 합 ÷ 100) */
  const colors = useStepColors();
  const dark = useStepColors(true);
  const [i, setI] = useState(o.month ?? NM - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  /* 누를 수 있는 나라: release 에 자료 있는 나라 행이 있고 나라 색인에 있는 것(투발루·남극·애시모어 등은 커서·선택 없음) */
  const { data: aoiIdx } = useQuery(aoiIndexQuery(o.mv));
  const pick = useMemo(() => pickableIso3(countries, aoiIdx), [countries, aoiIdx]);
  const pickRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    pickRef.current = pick;
  }, [pick]);
  const mapEl = useRef<HTMLDivElement>(null);
  const lbEl = useRef<HTMLCanvasElement>(null);
  const lbBase = useRef<ImageData | null>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [cont, setCont] = useState<ContinentId | null>(null);
  /* 이름표 = MapLibre Marker(지도와 같은 프레임에 움직임). 화면 언어가 바뀌면 다시 붙인다 */
  /* 육지 가림판(프런트 UI/UX, 2026-11-15): 1° 칸 점이 해안을 넘어 바다에 그려지지 않게, 지도 육지 면과 같은 world.json 을
     재생 캔버스와 같은 좌표(경도 → x, 메르카토르 위도 → y)로 그려 둔다. 해안선은 1.5px 넓혀(선 굵기 3) 해안 칸 점이 통째로 지워지지 않게 */
  const [landMask, setLandMask] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let dead = false;
    void fetch("/geo/world.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((g: { features?: { geometry?: { type: string; coordinates: unknown } | null }[] } | null) => {
        if (dead || !g?.features) return;
        const c = document.createElement("canvas");
        c.width = CW;
        c.height = CH;
        const x = c.getContext("2d");
        if (!x) return;
        const px = (lon: number) => (lon + 180) * PXD;
        const py = (lat: number) => (MY0 - merc(Math.max(-85, Math.min(85, lat)))) * PXR;
        x.fillStyle = "#fff";
        x.strokeStyle = "#fff";
        x.lineWidth = 3;
        x.lineJoin = "round";
        /* 다각형 하나씩 채운다(구멍은 그 다각형 안에서만 evenodd) — 나라끼리 경계가 살짝 겹쳐도 틈이 생기지 않게 */
        g.features.forEach((f) => {
          const gg = f.geometry;
          if (!gg) return;
          const polys = (gg.type === "Polygon" ? [gg.coordinates] : gg.type === "MultiPolygon" ? gg.coordinates : []) as number[][][][];
          polys.forEach((p) => {
            x.beginPath();
            p.forEach((ring) => ring.forEach((q, i) => (i ? x.lineTo(px(q[0] as number), py(q[1] as number)) : x.moveTo(px(q[0] as number), py(q[1] as number)))));
            x.fill("evenodd");
            x.stroke();
          });
        });
        setLandMask(c);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);
  /* 칸마다 점 자리 [경도, 위도](NaN = 그리지 않음) — PR #27: 칸 중심이 육지면 중심, 바다면 칸 안 육지 화소의 평균 자리, 육지가 없으면 뺀다 */
  const pos = useMemo(() => {
    if (!D) return null;
    const lon = new Float32Array(D.n);
    const lat = new Float32Array(D.n);
    const img = landMask?.getContext("2d")?.getImageData(0, 0, CW, CH).data ?? null;
    const land = (x: number, y: number) => !img || ((img[(y * CW + x) * 4 + 3] as number) > 0);
    const latOfY = (y: number) => Math.atan(Math.sinh(MY0 - y / PXR)) * (180 / Math.PI);
    for (let k = 0; k < D.n; k++) {
      const la = D.la[k] as number;
      const x0 = (D.bx[k] as number) - PXD / 2;
      lon[k] = NaN;
      lat[k] = NaN;
      if (la + 0.5 > LAT_N || la + 0.5 < LAT_S) continue;
      if (land(x0 + PXD / 2, D.by0[k] as number)) {
        lon[k] = x0 / PXD - 180 + 0.5;
        lat[k] = la + 0.5;
        continue;
      }
      const yT = Math.max(0, yOf(la + 1));
      const yB = Math.min(CH, yOf(la));
      let sx = 0;
      let sy = 0;
      let c = 0;
      for (let y = yT; y < yB; y++)
        for (let x = x0; x < x0 + PXD; x++)
          if (land(x, y)) {
            sx += x + 0.5;
            sy += y + 0.5;
            c++;
          }
      if (!c) continue;
      lon[k] = sx / c / PXD - 180;
      lat[k] = latOfY(sy / c);
    }
    return { lon, lat };
  }, [D, landMask]);
  const mlLib = useRef<typeof import("maplibre-gl") | null>(null);
  useEffect(() => {
    const lib = mlLib.current;
    if (!alive(map) || !lib) return;
    const marks = MAP_LABELS.map((l) => {
      const el = document.createElement("span");
      el.className = (l.kind === "sea" ? lbl.sea : lbl.land) ?? "";
      el.dataset.mapLabel = l.id;
      el.setAttribute("aria-hidden", "true");
      const b = document.createElement("b");
      b.textContent = lang === "ko" ? l.ko : l.en;
      el.appendChild(b);
      return new lib.Marker({ element: el, anchor: "center" }).setLngLat([l.at[0], l.at[1]]).addTo(map);
    });
    return () => marks.forEach((m) => m.remove());
  }, [map, lang]);
  const barEl = useRef<HTMLDivElement>(null);
  /* 대륙 줄 높이(범례를 그 위로 띄운다) */
  const [barH, setBarH] = useState(0);
  /* 쓰는 화면이 달을 바꾸면(분석 S1 달 고르기 — 목업 wfApi.setMonth) 재생 위치도 그 달로 */
  const [seenMonth, setSeenMonth] = useState(o.month);
  if (o.month !== seenMonth) {
    setSeenMonth(o.month);
    if (o.month != null && o.month >= 0 && o.month < NM) setI(o.month);
  }
  const onMonth = useRef(o.onMonth);
  useEffect(() => {
    onMonth.current = o.onMonth;
  }, [o.onMonth]);

  /* 지도 */
  useEffect(() => {
    let dead = false;
    let made: MlMap | null = null;
    let ro: ResizeObserver | null = null;
    void import("maplibre-gl").then((ml) => {
      if (dead || !mapEl.current) return;
      mlLib.current = ml;
      const m = new ml.Map({
        container: mapEl.current,
        attributionControl: false,
        center: [15, 12],
        zoom: 0.6,
        minZoom: 0,
        maxZoom: 6,
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        style: {
          version: 8,
          sources: {
            land: { type: "geojson", data: "/geo/world.json" },
            /* canvas 원천은 스타일 명세 타입에 없지만 MapLibre 가 실행 때 받는다(목업 worldgrid.js 와 같음) */
            /* 화재 점(PR #27): 지도 벡터 원 — 어느 확대에서도 또렷하다 */
            wf: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": tok("map-sea") } },
            { id: "land", type: "fill", source: "land", paint: { "fill-color": tok("map-land") } },
            /* 표시 규칙서 R3–R5: 단계 k = 0.1° 칸당(1° 합 ÷ 100) 5단계 · 색 5색 · 반지름 = 화면 px 규칙(단계별 최소·최대) · 불투명도 0.85 · 센 칸이 위 */
            {
              id: "wf",
              type: "circle",
              source: "wf",
              layout: { "circle-sort-key": ["get", "k"] },
              paint: { "circle-radius": radiusExpr(1) as never, "circle-color": stepColorExpr(colors) as never, "circle-opacity": CELL_OPACITY },
            },
            /* 고른 나라 강조(QA 2026-11-15) — 데이터를 가리지 않게: 고른 나라는 칠하지 않고 연회색 얇은 테두리(sel-line)만,
               나머지 나라는 #F9F9F9 막(45%)으로 흐리게(포커스). 나라를 안 골랐으면 막 없음(filter 가 아무것도 안 맞음) */
            { id: "dim", type: "fill", source: "land", filter: ["==", ["get", "iso3"], "\u0000"], paint: { "fill-color": "#F9F9F9", "fill-opacity": 0.45 } },
            { id: "line", type: "line", source: "land", paint: { "line-color": tok("map-boundary"), "line-opacity": 0.32, "line-width": 0.6 } },
            { id: "sel-line", type: "line", source: "land", filter: ["==", ["get", "iso3"], ""], paint: { "line-color": "#c4c4c4", "line-width": 1.2 } },
          ],
        },
      });
      made = m;
      m.touchZoomRotate.disableRotation();
      m.on("load", () => {
        m.fitBounds([[-170, -50], [180, 72]], { padding: 4, duration: 0 });
        setMap(m);
      });
      const isoAt = (pt: { x: number; y: number }) => {
        const f = m.queryRenderedFeatures([pt.x, pt.y], { layers: ["land"] })[0];
        const iso = (f?.properties as { iso3?: string } | undefined)?.iso3 ?? null;
        return { hit: !!f, iso: iso && (!pickRef.current || pickRef.current.has(iso)) ? iso : null };
      };
      m.on("mousemove", (ev) => {
        m.getCanvas().style.cursor = isoAt(ev.point).iso ? "pointer" : "";
      });
      m.on("click", (ev) => {
        const h = isoAt(ev.point);
        /* 고를 수 없는 나라 땅을 누르면 아무것도 바꾸지 않는다(바다를 누르면 전체로) */
        if (h.hit && !h.iso) return;
        setSel(h.iso);
      });
      ro = new ResizeObserver(() => m.resize());
      ro.observe(mapEl.current);
    });
    return () => {
      dead = true;
      ro?.disconnect();
      made?.remove();
      /* 지운 지도를 다른 effect 가 계속 쓰지 않게(개발 중 핫 리로드 때 getSource 오류) */
      setMap(null);
    };
    // 지도는 한 번만 만든다 — 색이 바뀌면 아래 effect 가 setPaintProperty 로 바꾼다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 테마가 바뀌면 점 색만 바꾼다 */
  useEffect(() => {
    if (!alive(map)) return;
    map.setPaintProperty("wf", "circle-color", stepColorExpr(colors) as never);
  }, [map, colors]);

  /* 한 달 그리기 → 점 원천 갱신(k = 단계 0–4) */
  useEffect(() => {
    if (!D || !pos) return;
    const feats: { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: { k: number } }[] = [];
    const bm = D.n * 2 + i * D.bpm;
    let p = D.off[i] as number;
    for (let k = 0; k < D.n; k++) {
      if (!((D.u8[bm + (k >> 3)] as number) & (1 << (k & 7)))) continue;
      const v = D.dq[D.u8[p++] as number] as number;
      const st = stepOfCell(v, 1);
      if (st == null) continue;
      const lo = pos.lon[k] as number;
      if (Number.isNaN(lo)) continue;
      feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [lo, pos.lat[k] as number] }, properties: { k: st } });
    }
    if (alive(map)) (map.getSource("wf") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
    onMonth.current?.(i);
  }, [D, pos, i, map]);

  /* 고른 나라 테두리 + 확대 (나라를 안 골랐으면 고른 대륙, 그것도 없으면 전 세계) */
  useEffect(() => {
    if (!alive(map)) return;
    map.setFilter("sel-line", ["==", ["get", "iso3"], sel ?? ""]);
    map.setFilter("dim", sel ? ["!=", ["get", "iso3"], sel] : ["==", ["get", "iso3"], "\u0000"]);
    if (!sel) {
      const c = CONTINENTS.find((x) => x.id === cont);
      if (c) map.fitBounds([[c.box[0], c.box[1]], [c.box[2], c.box[3]]], { padding: 24, duration: 600 });
      else map.fitBounds([[-170, -50], [180, 72]], { padding: 4, duration: 500 });
      return;
    }
    const b = countries.find((c) => c.iso3 === sel)?.bbox;
    if (b) {
      /* 나라 상자는 날짜 변경선을 넘으면 경도가 180 을 넘게 적혀 있다(미국 172 → 293). 세계 복사본을 그리지 않는 지도라 더 넓은 쪽만 남긴다
         (QA 2026-11-15: 미국을 고르면 러시아·아시아 쪽으로 가던 것) */
      map.fitBounds(boxBounds(b as number[], -58, 78), { padding: 24, maxZoom: 5, duration: 600 });
    }
  }, [map, sel, countries, cont]);

  useEffect(() => {
    const el = barEl.current;
    if (!map || !el) return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  /* 위도 5° 띠 × 달 */
  useEffect(() => {
    const c = lbEl.current;
    if (!D || !c) return;
    const g = c.getContext("2d");
    if (!g) return;
    const rows: number[] = [];
    D.band.band_south.forEach((s, j) => {
      if (s >= -60 && s < 80) rows.push(j);
    });
    const cw = c.width / NM;
    const rh = c.height / rows.length;
    g.clearRect(0, 0, c.width, c.height);
    for (let k = 0; k < NM; k++) {
      const v = D.band.v[k];
      if (!v) continue;
      rows.forEach((j, r) => {
        const x0 = v[j] == null ? 0 : (v[j] as number) / 10;
        if (!(x0 >= 10)) return;
        /* 위도 띠 합(5° 띠 × 달)은 칸이 아니라 띠 전체 양이고 어두운 셸 위 — 셸 쌍(h1·2·4·5·6, R4) 5단계, 경계는 띠 눈금(1천 · 1만 · 10만 · 100만) */
        g.fillStyle = dark[stepOf(x0 / 10000) ?? 0] as string;
        g.fillRect(k * cw, (rows.length - 1 - r) * rh, Math.ceil(cw), Math.ceil(rh));
      });
    }
    lbBase.current = g.getImageData(0, 0, c.width, c.height);
  }, [D, dark]);
  useEffect(() => {
    const c = lbEl.current;
    const g = c?.getContext("2d");
    if (!c || !g || !lbBase.current) return;
    g.putImageData(lbBase.current, 0, 0);
    g.fillStyle = tok("text-1");
    g.fillRect(Math.round(((i + 0.5) / NM) * c.width) - 1, 0, 2, c.height);
  }, [i, D, dark]);

  /* 재생: 초당 6 × 배속 달 */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    const per = 1000 / (6 * (SPEEDS[speed] as number));
    const frame = (now: number) => {
      acc += last ? now - last : 0;
      last = now;
      if (acc >= per) {
        acc %= per;
        setI((x) => (x >= NM - 1 ? 0 : x + 1));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const meta = D?.meta;
  const P = meta?.partial?.[0];
  const alt = P && P.m === i ? P : null;
  const tot = meta ? (alt ? alt.total : meta.total[i]) : null;
  const st = meta ? meta.codes.st[meta.world_aoi.st[i] ?? -1] : null;
  const vs = meta ? meta.codes.vs[meta.world_aoi.vs[i] ?? -1] : null;

  /* 달 띠(value_source 구간 · 결측 · 진행 중) */
  const bandBar = useMemo(() => {
    if (!meta) return [] as { cls: string; l: number; w: number; title: string }[];
    const v = meta.world_aoi.vs;
    const out: { cls: string; l: number; w: number; title: string }[] = [];
    let a = 0;
    for (let k = 1; k <= NM; k++)
      if (k === NM || v[k] !== v[a]) {
        const c = meta.codes.vs[v[a] ?? -1] ?? "";
        out.push({ cls: VS_CLS[c] ?? "af", l: a, w: k - a, title: `${t(`shell.vsrc.${c || "raw"}`)} · ${ymS(a)} – ${ymS(k - 1)}` });
        a = k;
      }
    meta.world_aoi.st.forEach((x, k) => {
      const s = meta.codes.st[x ?? -1];
      if (s === "missing") out.push({ cls: "nc", l: k, w: 1, title: `${ymS(k)} · ${t("shell.st.missing")}` });
      if (s === "partial") out.push({ cls: "tl", l: k, w: 1, title: `${ymS(k)} · ${t("shell.st.partial")}` });
    });
    return out;
  }, [meta, t]);
  const pct = (k: number) => `${((k / NM) * 100).toFixed(3)}%`;
  const cq = useQuery({ ...(o.rowsQuery(aoiOfIso3(sel ?? "KOR"), o.mv) as UseQueryOptions<WorldRows>), enabled: !!o.mv && !!sel, retry: false });
  const cRow = useMemo(() => {
    if (!sel) return null;
    if (cq.isError) return { value: null, verdict: null, status: null, known: false };
    const [y, m] = ymOfIndex(i);
    const r = cq.data?.months.find((x) => x.year === y && x.month === m);
    return r ? { value: r.value ?? null, verdict: r.verdict ?? null, status: r.status ?? null, known: true } : null;
  }, [sel, cq.isError, cq.data, i]);
  const cname = sel ? countryName(countries.find((c) => c.iso3 === sel), lang, sel) : "";

  return (
    <div className={cx("wf")} data-month={ymS(i)}>
      <div className={`${cx("wf-map")} ${lbl.host}`} ref={mapEl}>
        <MapLoading show={!map} />
        {map ? <MapKey level="L1" win={ymWord(lang, ...ymOfIndex(i))} lift={barH} fmt={(n) => fmtNum(lang, n)} /> : null}
        {map ? (
          <>
            {/* 지도 위 안내: 지금 달 · 그 달 합계(왼쪽 위) · 색 범례(오른쪽 위) */}
            <div className={hud.now} data-testid="wf-hud-month" aria-hidden="true">
              <b className={hud.ym}>{ymS(i)}</b>
              <span className={hud.tot}>
                {T("total")}
                <b>{isError ? "–" : tot == null ? "–" : fmtCompact(lang, tot)}</b>
              </span>
            </div>
            <div className={hud.leg} aria-hidden="true">
              <div className={hud.ramp}>
                {Array.from({ length: 9 }, (_, k) => (
                  <i key={k} style={{ background: o.ramp(0.18 + 0.82 * (k / 8)) }} />
                ))}
              </div>
              <div className={hud.ticks}>
                {["1", "10", "100", "1k", "10k"].map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {map ? (
          <div className={cj.bar} role="group" aria-label={lang === "ko" ? "대륙으로 이동" : "Jump to continent"}>
            {CONTINENTS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cj.btn}
                aria-pressed={!sel && cont === c.id}
                data-continent={c.id}
                onClick={() => {
                  setSel(null);
                  setCont((x) => (x === c.id && !sel ? null : c.id));
                }}
              >
                <i className={cj.dot} style={{ background: c.color }} aria-hidden="true" />
                {lang === "ko" ? c.ko : c.en}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className={cx("wf-side")}>
        <div className={cx("wf-now")}>
          <b className={cx("num")}>{ymS(i)}</b>
          <span>{st && st !== "ok" ? <Status st={st} /> : null}</span>
        </div>
        <dl className={cx("wf-kv")}>
          <div>
            <dt>{T("total")}</dt>
            <dd>
              <b className={cx("num")} title={tot == null ? "" : fmtNum(lang, tot, 1)}>
                {isError ? t("shell.err.data_not_loaded") : tot == null ? "–" : fmtCompact(lang, tot)}
              </b>
            </dd>
          </div>
          <div>
            <dt>{T("cells")}</dt>
            <dd>
              <b className={cx("num")}>{D ? fmtNum(lang, D.meta.counts[i] ?? 0) : "–"}</b>
            </dd>
          </div>
        </dl>
        {alt ? <p className={cx("wf-part num")}>{o.partialLine({ d: alt.as_of_date, v: fmtNum(lang, Math.round(alt.total)), p: fmtNum(lang, Math.round(alt.total_projected)) })}</p> : null}
        <p className={cx("wf-unit")}>
          {t("shell.unit.snpp_equiv")} · <span>{vs ? t(`shell.vsrc.${vs}`) : ""}</span>
        </p>
        {sel ? (
          <div className={cx("wf-sel")}>
            <div className={cx("wf-sh")}>
              <b>{cname}</b>
              <button type="button" className={cx("iconbtn")} aria-label={T("whole")} onClick={() => setSel(null)}>
                <X aria-hidden="true" />
              </button>
            </div>
            {cRow && cRow.known ? (
              <dl className={cx("wf-kv")}>
                <div>
                  <dt>{ymS(i)}</dt>
                  <dd>
                    <b className={cx("num")}>{cRow.value == null ? "–" : fmtNum(lang, cRow.value, cRow.value < 100 ? 1 : 0)}</b> {cRow.status && cRow.status !== "ok" ? <Status st={cRow.status} /> : null}
                  </dd>
                </div>
                <div>
                  <dt>{T("verdict")}</dt>
                  <dd>{cRow.verdict ? <Verdict v={cRow.verdict} /> : "–"}</dd>
                </div>
              </dl>
            ) : cRow ? (
              <p className={cx("wf-na")}>
                <Status st="out_of_range" />
              </p>
            ) : null}
            {o.onCountry && cRow?.known ? (
              <button
                type="button"
                className={cx("btn sm wf-go")}
                onClick={() => {
                  setPlaying(false);
                  o.onCountry?.(sel, i);
                }}
              >
                {T("to_country")}
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : (
          /* 목업은 hidden 속성을 display:flex 가 덮어 빈 칸(윗선)이 보인다 — 같은 모양 */
          <div className={cx("wf-sel")} aria-hidden="true" />
        )}
      </div>
      <div className={cx("wf-bar")}>
        <button type="button" className={cx("cm-play wf-play", playing && "on")} aria-label={T(playing ? "pause" : "play")} onClick={() => D && setPlaying((p) => !p)}>
          {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <div className={cx("seg wf-spd")} role="group" aria-label={T("speed")}>
          {SPEEDS.map((x, k) => (
            <button key={x} type="button" aria-pressed={k === speed} onClick={() => setSpeed(k)}>
              {x}×
            </button>
          ))}
        </div>
        <div className={cx("wf-track")}>
          <div className={cx("wf-band")} aria-hidden="true">
            {bandBar.map((b) => (
              <i key={`${b.cls}${b.l}`} className={cx("an-tk-s", b.cls)} style={{ left: pct(b.l), width: pct(b.w) }} title={b.title} />
            ))}
          </div>
          <input
            className={cx("cm-range wf-range")}
            type="range"
            min={0}
            max={NM - 1}
            step={1}
            value={i}
            /* 지나온 구간 채움(그라데이션) 길이 */
            style={{ "--p": `${((i / (NM - 1)) * 100).toFixed(2)}%` } as CSSProperties}
            aria-label={T("month")}
            onChange={(e) => {
              setPlaying(false);
              setI(+e.target.value);
            }}
          />
          <div className={cx("wf-ax num")} aria-hidden="true">
            {[2001, 2006, 2012, 2018, 2024].map((y) => (
              <span key={y} style={{ left: pct(mi(y, 1)) }}>
                {y}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={cx("wf-lb")}>
        <span className={cx("wf-legt")}>{T("latband")}</span>
        <div className={cx("wf-lbw")}>
          <canvas
            className={cx("wf-lbc")}
            ref={lbEl}
            width={626}
            height={144}
            role="img"
            aria-label={T("latband")}
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              setPlaying(false);
              setI(Math.max(0, Math.min(NM - 1, Math.floor(((e.clientX - b.left) / b.width) * NM))));
            }}
          />
          <div className={cx("wf-lbax num")} aria-hidden="true">
            <span>60°N</span>
            <span>0°</span>
            <span>60°S</span>
          </div>
        </div>
        <div className={cx("wf-lbyr num")} aria-hidden="true">
          {[2005, 2010, 2015, 2020, 2025].map((y) => (
            <span key={y} style={{ left: `${((((y - 2000) * 12 - 10 + 0.5) / NM) * 100).toFixed(2)}%` }}>
              {y}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
