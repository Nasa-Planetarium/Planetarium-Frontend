"use client";

import { useId } from "react";
import { useLocale } from "next-intl";
import { downloadBlob } from "@/shared/ui/download";
import { BarPaintDefs, topRoundPath } from "@/shared/ui";
import { CELL_OPACITY, DOT_EDGE_TOKEN, DOT_TOKEN, F, RMAX, RMIN, stepOfCell, stepVar } from "@/shared/lib/display";
import { cellFrame, ringsPath, type LandPart } from "../model/cell-frame";
import { fmtAxis, fmtVal, niceMax } from "../model/core";
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
/**
 * 날짜 범위 추이 막대(일별·월별). 모양은 캘린더 「같은 달 연도별」과 같다(shared/ui/bar-paint):
 * 보통 막대 = 주황 갈색 → 어두운 갈색 · 분석 달(hi) 막대 = 노랑 → 주황 → 분홍빛 빨강 + 은은한 빛 · hiValue 막대 위 값 · 결측(null) = 바닥 빗금 · 진행 중(partial) = 점선 테두리(그대로).
 */
export function Bars(o: { items: { key: string; label: string; value: number | null; partial?: boolean; title: string }[]; width: number; height: number; label: string; ticks?: number; allLabels?: boolean; hi?: (key: string) => boolean; hiValue?: string | null }) {
  const lang = useLocale();
  const pid = `tb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const Wd = o.width;
  const H = o.height;
  const pl = 44;
  const pr = 10;
  const pt = 20;
  const pb = 24;
  const n = o.items.length || 1;
  const mx = niceMax(Math.max(1, ...o.items.map((d) => d.value ?? 0)));
  const bw = (Wd - pl - pr) / n;
  const X = (i: number) => pl + i * bw;
  const Y = (v: number) => pt + (1 - v / mx) * (H - pt - pb);
  const MH = Math.min(12, H - pt - pb);
  const every = Math.max(1, Math.ceil(n / (o.ticks ?? 8)));
  const hiI = o.hiValue ? o.items.findIndex((d) => d.key === o.hiValue) : -1;
  const hv = hiI >= 0 ? (o.items[hiI]?.value ?? null) : null;
  return (
    <svg viewBox={`0 0 ${Wd} ${H}`} role="img" aria-label={o.label} className={cx("an-bars")}>
      <defs>
        <BarPaintDefs id={pid} />
      </defs>
      {[0, 0.5, 1].map((f) => {
        const y = Y(mx * f);
        return (
          <g key={f}>
            <line x1={pl} x2={Wd - pr} y1={y} y2={y} stroke={f ? C.line : C.line2} strokeDasharray={f ? "2 3" : undefined} />
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
        const hi = !!o.hi?.(d.key);
        return (
          <g key={d.key} data-hi={hi ? "1" : undefined}>
            {d.value == null ? (
              <rect x={x} y={Y(0) - MH} width={w} height={MH} fill={`url(#${pid}h)`} fillOpacity={0.8}>
                <title>{d.title}</title>
              </rect>
            ) : d.partial ? (
              <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--data-harm)" strokeDasharray="3 2">
                <title>{d.title}</title>
              </rect>
            ) : (
              <path d={topRoundPath(x, y, w, h, Math.min(3, w / 3))} fill={`url(#${pid}${hi ? "e" : "b"})`} filter={hi && h > 0 ? `url(#${pid}g)` : undefined}>
                <title>{d.title}</title>
              </path>
            )}
            {d.label && (o.allLabels || i % every === 0) ? <Tx x={X(i) + bw / 2} y={H - 8} s={d.label} anchor="middle" fill={C.dim} /> : null}
          </g>
        );
      })}
      {hv != null ? (
        <text x={X(hiI) + bw / 2} y={Math.max(12, Y(hv) - 6)} textAnchor={hiI > n - 3 ? "end" : hiI < 2 ? "start" : "middle"} className={cx("an-ev-v")}>
          {fmtVal(lang, hv)}
        </text>
      ) : null}
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
  /* 값이 이어진 구간들(빈 값에서 끊음) → 화면 좌표 */
  const runs = (vs: Pt[]) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    vs.forEach((p) => {
      if (p.y == null) {
        if (cur.length) out.push(cur);
        cur = [];
        return;
      }
      cur.push([X(p.x), Y(p.y)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  /* 부드러운 곡선(단조 3차 — 점 사이에서 값보다 튀어 오르거나 0 밑으로 내려가지 않는다) */
  const smooth = (q: [number, number][]) => {
    const n = q.length;
    if (n < 3) return q.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    const dx = q.slice(1).map((p, i) => p[0] - (q[i] as [number, number])[0]);
    const sl = q.slice(1).map((p, i) => (p[1] - (q[i] as [number, number])[1]) / ((dx[i] as number) || 1));
    const m = q.map((_, i) => (i === 0 ? (sl[0] as number) : i === n - 1 ? (sl[n - 2] as number) : (sl[i - 1] as number) * (sl[i] as number) <= 0 ? 0 : ((sl[i - 1] as number) + (sl[i] as number)) / 2));
    for (let i = 0; i < n - 1; i++) {
      const s = sl[i] as number;
      if (s === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = (m[i] as number) / s;
      const b = (m[i + 1] as number) / s;
      const h = a * a + b * b;
      if (h > 9) {
        const t = 3 / Math.sqrt(h);
        m[i] = t * a * s;
        m[i + 1] = t * b * s;
      }
    }
    let d = `M${q[0]![0].toFixed(1)} ${q[0]![1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const [xa, ya] = q[i] as [number, number];
      const [xb, yb] = q[i + 1] as [number, number];
      const h = (dx[i] as number) / 3;
      d += `C${(xa + h).toFixed(1)} ${(ya + (m[i] as number) * h).toFixed(1)} ${(xb - h).toFixed(1)} ${(yb - (m[i + 1] as number) * h).toFixed(1)} ${xb.toFixed(1)} ${yb.toFixed(1)}`;
    }
    return d;
  };
  const path = (vs: Pt[]) => runs(vs).map(smooth).join("");
  const y0 = Y(0);
  const area = (vs: Pt[]) =>
    runs(vs)
      .filter((q) => q.length > 1)
      .map((q) => `${smooth(q)}L${q[q.length - 1]![0].toFixed(1)} ${y0.toFixed(1)}L${q[0]![0].toFixed(1)} ${y0.toFixed(1)}Z`)
      .join("");
  /* 불꽃 강조(프런트 UI/UX 2026-11-15): 가장 굵은 선(고른 보기) = 시간 따라 붉은색 → 주황 → 호박색 그라데이션 면 + 빛나는 선 */
  const main = o.series.reduce<(typeof o.series)[number] | null>((a, s) => (!a || s.width > a.width ? s : a), null);
  const gid = `ln${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const years: number[] = [];
  for (let y = Math.ceil(x0); y <= x1; y++) if (y % 5 === 0) years.push(y);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={o.label} className={cx("an-lines")}>
      <defs>
        <linearGradient id={`${gid}h`} gradientUnits="userSpaceOnUse" x1={pl} y1={0} x2={W - pr} y2={0}>
          <stop offset="0" style={{ stopColor: "var(--h3)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--h4)" }} />
          <stop offset="1" style={{ stopColor: "var(--h5)" }} />
        </linearGradient>
        <linearGradient id={`${gid}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.04" />
        </linearGradient>
        <mask id={`${gid}m`} maskContentUnits="userSpaceOnUse">
          <rect x={0} y={pt} width={W} height={y0 - pt} fill={`url(#${gid}v)`} />
        </mask>
        <filter id={`${gid}g`} x="-5%" y="-30%" width="110%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pl} x2={W - pr} y1={Y(mx * f)} y2={Y(mx * f)} stroke={f ? C.line : C.line2} strokeDasharray={f ? "2 3" : undefined} />
          <Tx x={pl - 6} y={Y(mx * f) + 3.5} s={fmtAxis(lang, mx * f, 1000)} anchor="end" fill={C.dim} />
        </g>
      ))}
      {years.map((y) => (
        <Tx key={y} x={X(y)} y={H - 8} s={String(y)} anchor="middle" fill={C.dim} />
      ))}
      <line x1={X(o.marker.x)} x2={X(o.marker.x)} y1={pt} y2={H - pb} stroke={C.muted} strokeDasharray="3 3" />
      <Tx x={X(o.marker.x) + 4} y={pt + 8} s={o.marker.label} fill={C.muted} />
      {main ? <path d={area(main.values)} fill={`url(#${gid}h)`} mask={`url(#${gid}m)`} /> : null}
      {o.series
        .filter((s) => s !== main)
        .map((s) => (
          <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width} strokeOpacity={s.opacity} strokeDasharray={s.dash} strokeLinejoin="round" />
        ))}
      {main ? <path d={path(main.values)} fill="none" stroke={`url(#${gid}h)`} strokeWidth={main.width + 0.4} strokeLinejoin="round" strokeLinecap="round" filter={`url(#${gid}g)`} /> : null}
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
      {/* 표시 규칙서 R3–R5: 색 = 0.1° 칸당 월 감지량 5단계(지역 최댓값 대비 상대 색 없음) · 반지름 = 칸 간격 px × 0.5 × F[k] 를 단계별 최소·최대로 */}
      {o.cells
        .flatMap((c) => {
          const k = stepOfCell(c.value, o.cellDeg ?? 0.1);
          return k == null ? [] : [{ c, k }];
        })
        .sort((a, b) => a.k - b.k)
        .map(({ c, k }) => (
          <circle key={`${c.lat},${c.lon}`} data-k={k} cx={X(c.lon)} cy={Y(c.lat)} r={Math.max(RMIN[k] as number, Math.min(RMAX[k] as number, f.cs * 0.5 * (F[k] as number)))} fill={stepVar(k)} fillOpacity={CELL_OPACITY} stroke="var(--map-land)" strokeOpacity={0.7} strokeWidth={0.5}>
            <title>{c.title}</title>
          </circle>
        ))}
      {on.length ? <path d={on.map((p) => ringsPath(f, p.rings)).join("")} fill="none" stroke={C.ink} strokeWidth={1.4} strokeLinejoin="round" pointerEvents="none" data-an-on="" /> : null}
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
          <circle key={i} data-an-pt="" cx={X(p.lon)} cy={Y(p.lat)} r={2.2} fill={`var(--${DOT_TOKEN})`} stroke={`var(--${DOT_EDGE_TOKEN})`} strokeWidth={0.75}>
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
