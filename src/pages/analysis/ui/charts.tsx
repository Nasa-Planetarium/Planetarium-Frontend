"use client";

import { useLocale } from "next-intl";
import { downloadBlob } from "@/shared/ui/download";
import { cellFrame, cellRadius, ringsPath, type LandPart } from "../model/cell-frame";
import { fmtAxis, fmtVal, niceMax, stepOf } from "../model/core";
import { VS_TRACK, ymK, type Pt, type Regime } from "../model/analysis";
import { C, Tx } from "./cal-svg";
import { cx } from "./cx";

/**
 * 비교 분석 그림(목업 analysis.js track · barSVG · charts.line · charts.cells 의 이 화면 몫). 색은 토큰 var() 그대로.
 * 칸 지도는 결정 F9(점(원) 지도)대로 칸 중심에 원 — 크기 = 로그 단계(칸 간격에 맞춤), 색 = 열 램프, 바탕 = 바다 + 나라 1급 땅(model/cell-frame).
 */

/** 지원 기간 띠: 받은 구간을 비율대로만 그린다(목업 track). 위치는 계산값이라 인라인 style */
export function Track(o: { from: string; to: string; label: string; spans: (Regime & { label: string })[]; tail: { from: string; label: string } | null; mark: { k: number; label: string } | null; ticks: number[] }) {
  const k0 = ymK(o.from);
  const k1 = ymK(o.to) + 1;
  const W = k1 - k0 || 1;
  const pct = (k: number) => `${(((Math.max(k0, Math.min(k1, k)) - k0) / W) * 100).toFixed(2)}%`;
  const span = (from: string, to: string, cls: string, title: string, key: string) => (
    <i key={key} className={cx("an-tk-s", cls)} style={{ left: pct(ymK(from)), width: `calc(${pct(ymK(to) + 1)} - ${pct(ymK(from))})` }} title={title} />
  );
  const fr = o.mark ? (o.mark.k - k0) / W : 0;
  return (
    <div className={cx("an-tk")} role="img" aria-label={o.label}>
      <div className={cx("an-tk-bar")}>
        {o.spans.map((s, i) => span(s.from < o.from ? o.from : s.from, s.to > o.to ? o.to : s.to, VS_TRACK[s.vs] ?? "af", `${s.label} (${s.from} – ${s.to})`, `s${i}`))}
        {o.tail ? span(o.tail.from, o.tail.from, "tl", o.tail.label, "tail") : null}
        {o.mark ? (
          <b className={cx("an-tk-m", (o.mark.k < k0 || o.mark.k >= k1) && "out", fr > 0.75 ? "r" : fr < 0.25 ? "l" : null)} style={{ left: pct(o.mark.k + 0.5) }}>
            <span>{o.mark.label}</span>
          </b>
        ) : null}
      </div>
      <div className={cx("an-tk-ax")} aria-hidden="true">
        {o.ticks.map((t) => (
          <span key={t} style={{ left: pct(t * 12) }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 막대 그림(⑤): 진행 중인 달은 점선 테두리 막대(채움 없음) */
export function Bars(o: { items: { key: string; label: string; value: number | null; partial?: boolean; title: string }[]; width: number; height: number; label: string; ticks?: number; allLabels?: boolean }) {
  const lang = useLocale();
  const Wd = o.width;
  const H = o.height;
  const pl = 44;
  const pr = 10;
  const pt = 12;
  const pb = 24;
  const n = o.items.length || 1;
  const mx = niceMax(Math.max(1, ...o.items.map((d) => d.value ?? 0)));
  const bw = (Wd - pl - pr) / n;
  const X = (i: number) => pl + i * bw;
  const Y = (v: number) => pt + (1 - v / mx) * (H - pt - pb);
  const every = Math.max(1, Math.ceil(n / (o.ticks ?? 8)));
  return (
    <svg viewBox={`0 0 ${Wd} ${H}`} role="img" aria-label={o.label} className={cx("an-bars")}>
      {[0, 0.5, 1].map((f) => {
        const y = Y(mx * f);
        return (
          <g key={f}>
            <line x1={pl} x2={Wd - pr} y1={y} y2={y} stroke={f ? C.line : C.line2} />
            <Tx x={pl - 6} y={y + 3.5} s={fmtAxis(lang, mx * f, 1000)} anchor="end" fill={C.dim} />
          </g>
        );
      })}
      {o.items.map((d, i) => {
        const v = d.value ?? 0;
        const x = X(i) + Math.max(0.5, bw * 0.12);
        const w = Math.max(1, bw * 0.76);
        const y = Y(v);
        const h = Math.max(0, Y(0) - y);
        return (
          <g key={d.key}>
            {d.partial ? (
              <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--data-harm)" strokeDasharray="3 2">
                <title>{d.title}</title>
              </rect>
            ) : (
              <rect x={x} y={y} width={w} height={h} fill="var(--data-base)">
                <title>{d.title}</title>
              </rect>
            )}
            {d.label && (o.allLabels || i % every === 0) ? <Tx x={X(i) + bw / 2} y={H - 8} s={d.label} anchor="middle" fill={C.dim} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/** 선 그림(⑥ 보정 전·후): 고른 보기 선은 굵게, 나머지는 흐리게. 2012-02 경계 점선 */
export function Lines(o: { series: { name: string; color: string; values: Pt[]; width: number; opacity: number; dash?: string }[]; width: number; height: number; label: string; marker: { x: number; label: string } }) {
  const lang = useLocale();
  const W = o.width;
  const H = o.height;
  const pl = 48;
  const pr = 12;
  const pt = 16;
  const pb = 26;
  const xs = o.series.flatMap((s) => s.values.map((p) => p.x));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const mx = niceMax(Math.max(1, ...o.series.flatMap((s) => s.values.map((p) => p.y ?? 0))));
  const X = (x: number) => pl + ((x - x0) / (x1 - x0 || 1)) * (W - pl - pr);
  const Y = (v: number) => pt + (1 - v / mx) * (H - pt - pb);
  const path = (vs: Pt[]) => {
    let d = "";
    let pen = false;
    vs.forEach((p) => {
      if (p.y == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const years: number[] = [];
  for (let y = Math.ceil(x0); y <= x1; y++) if (y % 5 === 0) years.push(y);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={o.label} className={cx("an-lines")}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pl} x2={W - pr} y1={Y(mx * f)} y2={Y(mx * f)} stroke={f ? C.line : C.line2} />
          <Tx x={pl - 6} y={Y(mx * f) + 3.5} s={fmtAxis(lang, mx * f, 1000)} anchor="end" fill={C.dim} />
        </g>
      ))}
      {years.map((y) => (
        <Tx key={y} x={X(y)} y={H - 8} s={String(y)} anchor="middle" fill={C.dim} />
      ))}
      <line x1={X(o.marker.x)} x2={X(o.marker.x)} y1={pt} y2={H - pb} stroke={C.muted} strokeDasharray="3 3" />
      <Tx x={X(o.marker.x) + 4} y={pt + 8} s={o.marker.label} fill={C.muted} />
      {o.series.map((s) => (
        <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width} strokeOpacity={s.opacity} strokeDasharray={s.dash} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** 칸 지도(F9 점(원) 지도): 칸 중심에 원. 반지름 = 로그 단계(1 · 10 · 100 · 1000), 색 = 열 램프 */
export interface CellDot {
  lat: number;
  lon: number;
  value: number;
  title: string;
}
/** 점 층(목업 EM.charts.cells points · image): 감지 점 = 속 빈 작은 원, FIRMS WMS = 그림 한 장(bbox 서,남,동,북) */
export interface CellPt {
  lon: number;
  lat: number;
  title: string;
}
export function CellDots(o: {
  cells: CellDot[];
  ramp: (t: number) => string;
  scaleMax: number;
  width: number;
  label: string;
  points?: CellPt[];
  image?: { href: string; bbox: [number, number, number, number] } | null;
  /** 바탕 땅 면(나라 1급 · 세계 윤곽) — 없으면 바다 바탕만 */
  land?: LandPart[];
  /** 접기 중심 경도(나라 중심) */
  c0?: number | null;
  /** 칸 크기(도) — 원 반지름을 칸 간격에 맞춘다 */
  cellDeg?: number;
  maxH?: number;
}) {
  if (!o.cells.length) return null;
  const land = o.land ?? [];
  const f = cellFrame({ cells: o.cells, land, c0: o.c0, cellDeg: o.cellDeg ?? 0.1, width: o.width, maxH: o.maxH ?? 520 });
  if (!f) return null;
  const { X, Y } = f;
  const [w, s, e, n] = f.bbox;
  const on = land.filter((p) => p.on);
  return (
    <svg viewBox={`0 0 ${f.W} ${f.H}`} role="img" aria-label={o.label} data-an-cellmap="" data-land={land.length}>
      <rect x={0} y={0} width={f.W} height={f.H} fill="var(--map-sea)" data-an-sea="" />
      {land.length ? <path d={land.map((p) => ringsPath(f, p.rings)).join("")} fill="var(--map-land)" stroke="var(--map-boundary)" strokeOpacity={0.55} strokeWidth={0.6} strokeLinejoin="round" pointerEvents="none" data-an-land="" /> : null}
      {o.cells
        .slice()
        .sort((a, b) => a.value - b.value)
        .map((c) => (
          <circle key={`${c.lat},${c.lon}`} cx={X(c.lon)} cy={Y(c.lat)} r={cellRadius(f.cs, stepOf(c.value))} fill={o.ramp(Math.sqrt(Math.min(1, c.value / (o.scaleMax || 1))))} fillOpacity={0.92} stroke="var(--map-land)" strokeOpacity={0.8} strokeWidth={0.6}>
            <title>{c.title}</title>
          </circle>
        ))}
      {on.length ? <path d={on.map((p) => ringsPath(f, p.rings)).join("")} fill="none" stroke="var(--map-sel)" strokeWidth={1.6} strokeLinejoin="round" pointerEvents="none" data-an-on="" /> : null}
      {o.image ? (
        <image
          data-an-wms=""
          href={o.image.href}
          x={X(o.image.bbox[0])}
          y={Y(o.image.bbox[3])}
          width={X(o.image.bbox[2]) - X(o.image.bbox[0])}
          height={Y(o.image.bbox[1]) - Y(o.image.bbox[3])}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
      ) : null}
      {(o.points ?? [])
        .filter((p) => p.lat >= s && p.lat <= n && f.wrap(p.lon) >= w && f.wrap(p.lon) <= e)
        .map((p, i) => (
          <circle key={i} data-an-pt="" cx={X(p.lon)} cy={Y(p.lat)} r={1.8} fill="var(--map-sel)" stroke="var(--map-halo)" strokeWidth={0.8}>
            <title>{p.title}</title>
          </circle>
        ))}
    </svg>
  );
}

/** 짧은 값 표기(화면 공통) */
export const useNf = () => {
  const lang = useLocale();
  return (x: number | null | undefined) => fmtVal(lang, x);
};

/** SVG → PNG(2배). var(--x) 는 지금 값으로 바꿔 그린다 */
export async function svgToPng(svg: SVGSVGElement, name: string) {
  const cs = getComputedStyle(document.documentElement);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(vb.width));
  clone.setAttribute("height", String(vb.height));
  const txt = new XMLSerializer().serializeToString(clone).replace(/var\((--[\w-]+)\)/g, (_, v: string) => cs.getPropertyValue(v).trim() || "#000");
  const img = new Image();
  const url = URL.createObjectURL(new Blob([txt], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error("svg"));
      img.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = vb.width * 2;
    cv.height = vb.height * 2;
    const g = cv.getContext("2d");
    if (!g) return;
    g.fillStyle = cs.getPropertyValue("--surface-1").trim() || "#000";
    g.fillRect(0, 0, cv.width, cv.height);
    g.scale(2, 2);
    g.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
    if (blob) saveBlob(blob, name);
  } finally {
    URL.revokeObjectURL(url);
  }
}
/** 저장 — 셸 공용(저장 토스트: CSV 「n행」 + 복사 · PNG 「W × H PNG」) */
export function saveBlob(blob: Blob, name: string) {
  downloadBlob(name, blob);
}
export const saveText = (name: string, text: string, type = "text/csv") => saveBlob(new Blob(["﻿", text], { type: `${type};charset=utf-8` }), name);
