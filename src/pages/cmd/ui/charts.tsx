"use client";

import { useId, type ReactNode } from "react";
import { BarPaintDefs } from "@/shared/ui";
import { ticks } from "../model/cmd";
import { cx } from "./cx";

/** 차트 색(목업 EM.C → 토큰). SVG 속성에 CSS 변수를 그대로 쓴다 */
export const C = {
  ink: "var(--text-1)",
  muted: "var(--text-2)",
  dim: "var(--text-3)",
  line: "var(--line-soft)",
  line2: "var(--line-strong)",
  bg: "var(--surface-0)",
  signal: "var(--accent)",
  base: "var(--data-base)",
  modis: "var(--data-modis)",
  viirs: "var(--data-viirs)",
  harm: "var(--data-harm)",
  ok: "var(--ok)",
  zero: "var(--data-zero)",
  onWarm: "var(--on-warm)",
  hatchBg: "var(--hatch-bg)",
};
const KO = /[가-힣]/;

/** 빗금 무늬(결측) */
export function Hatch({ id, bg = "var(--surface-2)", col = C.muted, op = 0.55 }: { id: string; bg?: string; col?: string; op?: number }) {
  return (
    <defs>
      <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill={bg} />
        <line x1="0" y1="0" x2="0" y2="5" stroke={col} strokeOpacity={op} strokeWidth="1.6" />
      </pattern>
    </defs>
  );
}

/** 축 글자(목업 charts.js T) */
export const Tx = ({ x, y, children, anchor, fill = C.muted }: { x: number | string; y: number | string; children: ReactNode; anchor?: "start" | "middle" | "end"; fill?: string }) => (
  <text x={x} y={y} textAnchor={anchor} fill={fill} fontSize="11" className={KO.test(String(children)) ? cx("t-ko") : undefined}>
    {children}
  </text>
);

export interface LineSeries {
  k: string;
  name: string;
  short?: string;
  color: string;
  width: number;
  dash?: string;
  area?: boolean;
  values: { x: number; y: number | null }[];
}

/** 연간 시계열(목업 EM.charts.line + cmd.js endLabels): 선 끝 직접 이름표 */
export function LineChart({ series, width: W, height: H, endW, marker, label, axisFmt }: { series: LineSeries[]; width: number; height: number; endW: number; marker: number | null; label: string; axisFmt: (v: number) => string }) {
  const CW = W - endW;
  const pl = 44;
  const pr = 14;
  const pt = 14;
  const pb = 26;
  const xs = series.flatMap((s) => s.values.map((v) => v.x));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const ymax = Math.max(...series.flatMap((s) => s.values.map((v) => v.y ?? 0)));
  const tk = ticks(ymax, 4);
  const X = (x: number) => pl + ((x - x0) / (x1 - x0 || 1)) * (CW - pl - pr);
  const Y = (y: number) => pt + (1 - y / tk.max) * (H - pt - pb);
  const segD = (vals: { x: number; y: number | null }[]) => {
    const runs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    vals.forEach((v) => {
      if (v.y != null) cur.push({ x: v.x, y: v.y });
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    });
    if (cur.length) runs.push(cur);
    return runs;
  };
  const xt: number[] = [];
  for (let x = x0; x <= x1; x += 5) xt.push(x);
  /* 끝 이름표: 끝점이 가까우면 아래로 비켜 쓰고 가는 선으로 잇는다 */
  const ends = series
    .map((se) => {
      const q = se.values.filter((v) => v.y != null);
      const l = q[q.length - 1];
      return l && l.y != null ? { se, x: X(l.x), y: Y(l.y), ly: 0 } : null;
    })
    .filter((e): e is { se: LineSeries; x: number; y: number; ly: number } => !!e)
    .sort((a, b) => a.y - b.y);
  ends.forEach((e, i) => (e.ly = i ? Math.max(e.y, (ends[i - 1]?.ly ?? 0) + 18) : Math.max(e.y, pt + 4)));
  const over = ends.length ? (ends[ends.length - 1]?.ly ?? 0) - (H - pb) : 0;
  if (over > 0) ends.forEach((e) => (e.ly -= over));
  const lx = CW - 14 + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ fontVariantNumeric: "tabular-nums" }} role="img" aria-label={label}>
      {tk.ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={CW - pr} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C.line2 : C.line} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <Tx x={pl - 6} y={Y(v) + 3.5} anchor="end">
            {axisFmt(v)}
          </Tx>
        </g>
      ))}
      {xt.map((x) => (
        <Tx key={x} x={X(x)} y={H - 8} anchor="middle">
          {x}
        </Tx>
      ))}
      {marker != null ? (
        <g>
          <line x1={X(marker)} x2={X(marker)} y1={pt} y2={H - pb} stroke={C.ok} strokeDasharray="3 3" />
          <Tx x={X(marker) + (X(marker) > CW - 44 ? -4 : 4)} y={pt + 11} anchor={X(marker) > CW - 44 ? "end" : undefined} fill={C.ok}>
            {String(marker)}
          </Tx>
        </g>
      ) : null}
      {series.map((se) => {
        const runs = segD(se.values);
        const d = runs.map((g) => g.map((v, i) => `${i ? "L" : "M"}${X(v.x).toFixed(1)} ${Y(v.y).toFixed(1)}`).join("")).join("");
        const last = runs[runs.length - 1]?.slice(-1)[0];
        return (
          <g key={se.k}>
            {se.area
              ? runs.map((g, i) => (
                  <path key={i} d={`${g.map((v, j) => `${j ? "L" : "M"}${X(v.x).toFixed(1)} ${Y(v.y).toFixed(1)}`).join("")}L${X(g[g.length - 1]?.x ?? 0)} ${Y(0)}L${X(g[0]?.x ?? 0)} ${Y(0)}Z`} fill={se.color} fillOpacity=".12" />
                ))
              : null}
            <path d={d} fill="none" stroke={se.color} strokeWidth={se.width} strokeDasharray={se.dash} strokeLinejoin="round" strokeLinecap="round" />
            {last ? <circle cx={X(last.x)} cy={Y(last.y)} r="3.2" fill={se.color} /> : null}
          </g>
        );
      })}
      {ends.map((e) => (
        <g key={e.se.k}>
          {Math.abs(e.ly - e.y) > 3 ? <line x1={(e.x + 3).toFixed(1)} y1={e.y.toFixed(1)} x2={(lx - 2).toFixed(1)} y2={e.ly.toFixed(1)} stroke={e.se.color} strokeWidth="1" strokeOpacity=".6" /> : null}
          <line x1={lx} x2={lx + 8} y1={e.ly.toFixed(1)} y2={e.ly.toFixed(1)} stroke={e.se.color} strokeWidth="2" strokeDasharray={e.se.dash ? "2 2" : undefined} />
          <text className={cx("end-lbl", KO.test(e.se.short ?? e.se.name) && "t-ko")} x={lx + 11} y={(e.ly + 4).toFixed(1)} fill={C.muted}>
            {e.se.short ?? e.se.name}
            <title>{e.se.name}</title>
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 가로 막대(목업 EM.charts.bars) */
export function Bars({ items, width: W, rowH, labelW, max, label, fmt, onPick }: { items: { id: string; label: string; value: number; color: string; out: boolean; note?: string }[]; width: number; rowH: number; labelW: number; max: number; label: string; fmt: (v: number, it: { out: boolean }) => string; onPick?: (id: string) => void }) {
  const pr = 64;
  const H = items.length * rowH + 6;
  const pid = `rb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ fontVariantNumeric: "tabular-nums" }} role="img" aria-label={label}>
      <defs>
        <BarPaintDefs id={pid} />
      </defs>
      {items.map((it, i) => {
        const y = i * rowH + 4;
        const w = Math.max(1.5, (it.value / max) * (W - labelW - pr));
        return (
          <g key={it.id}>
            <text x={labelW - 8} y={y + rowH / 2} textAnchor="end" fill={C.ink} fontSize="12" fillOpacity={it.out ? 0.45 : it.value ? undefined : 0.7} className={KO.test(it.label) ? cx("t-ko") : undefined}>
              {it.label}
            </text>
            <rect x={labelW} y={y + 5} width={W - labelW - pr} height={rowH - 12} rx="1" fill={C.line} fillOpacity=".5" />
            <rect x={labelW} y={y + 5} width={w.toFixed(1)} height={rowH - 12} rx="2" fill={it.value ? `url(#${pid}bx)` : it.color} fillOpacity={it.out ? 0.45 : undefined} style={it.value && onPick ? { cursor: "pointer" } : undefined} onClick={it.value && onPick ? () => onPick(it.id) : undefined}>
              <title>{`${it.label} ${fmt(it.value, it)}`}</title>
            </rect>
            <text x={labelW + w + 6} y={y + rowH / 2 + 3.5} fill={C.muted} fontSize="11" className={KO.test(fmt(it.value, it)) ? cx("t-ko") : undefined}>
              {fmt(it.value, it)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 한 줄 누적 막대 + 범례(목업 EM.charts.stack) */
export function Stack({ segments, fmt }: { segments: { label: string; value: number; color: string }[]; fmt: (v: number) => string }) {
  const tot = segments.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <>
      <div style={{ display: "flex", height: 14, borderRadius: "var(--r-xs)", overflow: "hidden", background: "var(--line-soft)" }}>
        {segments.map((sg) => (
          <span key={sg.label} title={`${sg.label} ${fmt(sg.value)}`} style={{ width: `${((sg.value / tot) * 100).toFixed(2)}%`, background: sg.color }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1) var(--sp-4)", marginTop: "var(--sp-2)", fontSize: "var(--fs-2)" }}>
        {segments.map((sg) => (
          <span key={sg.label} style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)", color: "var(--text-2)" }}>
            <i style={{ width: 9, height: 9, borderRadius: "var(--r-2xs)", background: sg.color }} />
            {sg.label} <b className={cx("num")} style={{ color: "var(--text-1)", fontWeight: "var(--fw-medium)" }}>{fmt(sg.value)}</b>
            <span className={cx("num")}>{((sg.value / tot) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </>
  );
}

/** 위성 연대 띠(HTML 판 EM.ui.eras): 2001–2026 축(막대 중심 7px 안쪽) */
const SATS = [
  { sat: "Terra", short: "T", sensor: "MODIS", start: "2000-02" },
  { sat: "Aqua", short: "Aqua", sensor: "MODIS", start: "2002-07" },
  { sat: "S-NPP", short: "S-NPP", sensor: "VIIRS", start: "2012-01" },
  { sat: "NOAA-20", short: "N20", sensor: "VIIRS", start: "2018-01" },
  { sat: "NOAA-21", short: "N21", sensor: "VIIRS", start: "2023-02" },
];
export function Eras({ from, to, width, title, aria }: { from: number; to: number; width: number; title: (sat: string, sensor: string, d: string) => string; aria: string }) {
  const yf = (d: string) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12;
  const span = to - from;
  const pos = (d: string) => Math.max(0, Math.min(1, (yf(d) - from) / span));
  const W = Math.max(0, width - 14);
  /* 이름 배치: 겹치면 짧은 이름, 그래도 겹치면 생략(간격 12px) */
  let last = -1e9;
  const labels: ({ q: (typeof SATS)[number]; txt: string; l: number; short: boolean } | null)[] = [];
  for (const q of SATS) {
    const x = 7 + pos(q.start) * W;
    const wf = q.sat.length * 6.8;
    const ws = q.short.length * 6.8;
    const pre = q.start.slice(0, 4) < String(from);
    let txt = pre ? q.short : q.sat;
    let l = pre ? 4 : x - wf / 2;
    if (l < last + 12) {
      txt = q.short;
      l = Math.max(x - ws / 2, 4);
    }
    if (l < last + 12) {
      labels.push(null);
      continue;
    }
    last = l + txt.length * 6.8;
    labels.push({ q, txt, l, short: txt !== q.sat });
  }
  return (
    <div className={cx("cm-era eras")} role="img" aria-label={aria}>
      <span className={cx("er-ln")} />
      {SATS.map((q) => (
        <span key={q.sat} className={cx("er-t", q.sensor === "VIIRS" && "v")} style={{ left: `${(pos(q.start) * 100).toFixed(2)}%` }} title={title(q.sat, q.sensor, q.start)} />
      ))}
      <span className={cx("er-ls")}>
        {labels.map((p) =>
          p ? (
            <span key={p.q.sat} className={cx("er-l", p.short && "short")} style={{ left: `${p.l.toFixed(1)}px` }} title={title(p.q.sat, p.q.sensor, p.q.start)}>
              {p.txt}
            </span>
          ) : null,
        )}
      </span>
    </div>
  );
}
