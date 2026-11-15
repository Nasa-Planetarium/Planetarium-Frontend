"use client";

import { useId, type KeyboardEvent } from "react";
import { useLocale } from "next-intl";
import { useT } from "@/shared/i18n";
import { displayInterval, hasSpread } from "@/shared/lib/display";
import { fmtAxis, fmtNum, ticks } from "../model/core";
import { C, Tx } from "./cal-svg";
import { cx } from "./cx";

/**
 * 같은 달 연도별 막대(목업 EM.charts.dist). release 값을 그대로 그린다 — 다시 계산하지 않는다.
 * 띠 = 기준 p25–p75 · 점선 = 중앙값 · 수염 = 화면 구간 displayInterval(value, value_lo, value_hi)(F16 — 값까지 넓힘) · 결측 = 바닥의 낮은 빗금 칸.
 */
export interface DistItem {
  year: number;
  value: number | null;
  state: "baseline" | "evaluated" | "missing";
  partial?: boolean;
  value_lo?: number | null;
  value_hi?: number | null;
}
export function DistChart(o: {
  dist: DistItem[];
  median: number | null;
  bandLo: number | null;
  bandHi: number | null;
  unit: string;
  width: number;
  height: number;
  label: string;
  whiskerLabel: string;
  onBar?: ((y: number) => void) | null;
}) {
  const t = useT();
  const lang = useLocale();
  const hid = `ds${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const d = o.dist;
  const W = o.width;
  const H = o.height;
  const pl = 40;
  const pr = 12;
  const pt = 22;
  const pb = 24;
  const vals = d.map((x) => x.value).filter((v): v is number => v != null);
  const ivs = d.map((x) => displayInterval(x.value, x.value_lo, x.value_hi));
  const tk = ticks(Math.max(4, ...vals, o.bandHi ?? 0, ...ivs.map((iv) => iv?.hi ?? 0)), 4);
  if (tk.max <= 8) tk.ticks = Array.from({ length: tk.max + 1 }, (_, i) => i).filter((v) => tk.max <= 5 || v % 2 === 0);
  const n = Math.max(1, d.length);
  const bw = (W - pl - pr) / n;
  const X = (i: number) => pl + i * bw;
  const Y = (v: number) => pt + (1 - v / tk.max) * (H - pt - pb);
  const MH = Math.min(22, H - pt - pb);
  const evI = d.findIndex((x) => x.state === "evaluated");
  const f = (v: number) => fmtNum(lang, v);

  const bars = d.map((x, i) => {
    const bx = X(i) + Math.max(1, bw * 0.16);
    const w = Math.max(2, bw * 0.68);
    const tt = `${x.year} · `;
    const ev = x.state === "evaluated";
    const btn = o.onBar ? { role: "button", tabIndex: ev ? 0 : -1, style: { cursor: "pointer" }, onClick: () => o.onBar?.(x.year) } : {};
    if (x.value == null) {
      return (
        <rect key={x.year} className={cx("ds-b")} data-y={x.year} x={bx} y={Y(0) - MH} width={w} height={MH} rx={2} fill={`url(#${hid})`} fillOpacity={ev ? undefined : 0.8} stroke={ev ? C.viirs : undefined} strokeWidth={ev ? 1.5 : undefined} {...btn}>
          <title>{tt + t("shell.chart.missing_cell")}</title>
        </rect>
      );
    }
    const h = Math.max(x.value === 0 ? 0 : 1.5, Y(0) - Y(x.value));
    return (
      <g key={x.year}>
        <rect className={cx("ds-b")} data-y={x.year} x={bx} y={Y(0) - h} width={w} height={h} rx={2} fill={ev ? C.viirs : C.base} stroke={ev && x.partial ? C.ink : undefined} strokeWidth={ev && x.partial ? 1.4 : undefined} strokeDasharray={ev && x.partial ? "3 2" : undefined} {...btn}>
          <title>{`${tt}${f(x.value)} ${o.unit}`}</title>
        </rect>
        {x.value === 0 ? <Tx x={bx + w / 2} y={Y(0) - 3} s="0" anchor="middle" fill={ev ? C.viirs : C.muted} /> : null}
        {hasSpread(ivs[i])
          ? ((iv) => {
              const cw = Math.max(2, w * 0.25);
              const cxp = bx + w / 2;
              const y1 = Y(Math.min(iv.hi, tk.max));
              const y0 = Y(Math.max(0, iv.lo));
              return (
                <path d={`M${cxp.toFixed(1)} ${y1.toFixed(1)}V${y0.toFixed(1)}M${(cxp - cw).toFixed(1)} ${y1.toFixed(1)}h${(2 * cw).toFixed(1)}M${(cxp - cw).toFixed(1)} ${y0.toFixed(1)}h${(2 * cw).toFixed(1)}`} stroke={C.ink} strokeOpacity={0.8} strokeWidth={1} fill="none" pointerEvents="none">
                  <title>{`${x.year} · ${o.whiskerLabel} ${f(Math.round(iv.lo))}–${f(Math.round(iv.hi))}`}</title>
                </path>
              );
            })(ivs[i])
          : null}
      </g>
    );
  });

  /* 연도 눈금: 평가 해 먼저, 나머지는 26px 이상 떨어질 때만 */
  const yx: number[] = [];
  const tick = new Set<number>();
  if (evI >= 0) yx.push(X(evI) + bw / 2);
  d.forEach((x, i) => {
    if (i === evI || !((x.year % 5 === 0 || i === 0) && Math.abs(i - evI) > 1)) return;
    const c = X(i) + bw / 2;
    if (yx.some((q) => Math.abs(q - c) < 26)) return;
    yx.push(c);
    tick.add(i);
  });
  const ev = evI >= 0 ? d[evI] : null;

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const list = Array.from(e.currentTarget.querySelectorAll<SVGElement>("[data-y][role=button]"));
    const i = list.indexOf(e.target as SVGElement);
    if (i < 0) return;
    const j = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : null;
    if (j != null) {
      e.preventDefault();
      const to = list[Math.max(0, Math.min(list.length - 1, j))] as SVGElement;
      list[i]?.setAttribute("tabindex", "-1");
      to.setAttribute("tabindex", "0");
      to.focus({ preventScroll: true });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      o.onBar?.(+((e.target as SVGElement).dataset.y ?? 0));
    }
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ fontVariantNumeric: "tabular-nums" }} role={o.onBar ? "group" : "img"} aria-label={o.label} onKeyDown={o.onBar ? onKey : undefined}>
      <defs>
        <pattern id={hid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={C.hatchBg} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={C.dim} strokeWidth="1.6" />
        </pattern>
      </defs>
      {tk.ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C.line2 : C.line} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <Tx x={pl - 6} y={Y(v) + 3.5} s={fmtAxis(lang, v)} anchor="end" />
        </g>
      ))}
      {o.bandLo != null && o.bandHi != null ? (
        <g>
          <rect x={pl} y={Y(o.bandHi)} width={W - pl - pr} height={Math.max(1, Y(o.bandLo) - Y(o.bandHi))} fill={C.signal} fillOpacity={0.1}>
            <title>{`p25–p75 ${f(o.bandLo)}–${f(o.bandHi)}`}</title>
          </rect>
          <line x1={pl} x2={W - pr} y1={Y(o.bandHi)} y2={Y(o.bandHi)} stroke={C.signal} strokeOpacity={0.45} strokeDasharray="2 3" />
          <line x1={pl} x2={W - pr} y1={Y(o.bandLo)} y2={Y(o.bandLo)} stroke={C.signal} strokeOpacity={0.45} strokeDasharray="2 3" />
        </g>
      ) : null}
      {bars}
      {o.median != null ? (
        <g>
          <line x1={pl} x2={W - pr} y1={Y(o.median)} y2={Y(o.median)} stroke={C.ink} strokeWidth={1.3} strokeDasharray="5 3" />
          <Tx x={pl} y={12} s={`— ${t("shell.chart.median", { n: f(Math.round(o.median * 10) / 10) })}`} fill={C.ink} />
        </g>
      ) : null}
      {ev && ev.value ? <Tx x={X(evI) + bw / 2} y={Math.max(11, Y(ev.value) - 6)} s={f(ev.value)} anchor={evI > n - 3 ? "end" : "middle"} weight="600" fill={C.viirs} /> : null}
      {d.map((x, i) =>
        i === evI || tick.has(i) ? <Tx key={`t${x.year}`} x={X(i) + bw / 2} y={H - 7} s={i === evI ? x.year : `'${String(x.year).slice(2)}`} anchor="middle" weight={i === evI ? "600" : undefined} fill={i === evI ? C.viirs : C.muted} /> : null,
      )}
    </svg>
  );
}
