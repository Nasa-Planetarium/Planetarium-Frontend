"use client";

import { forwardRef, useId, type KeyboardEvent, type MouseEvent } from "react";
import type { Band, GridRow } from "../model/calendar";
import { vsCls, yfOf } from "../model/calendar";
import { cx } from "./cx";

/**
 * 연×월 캘린더 SVG(목업 EM.charts.calendar 의 years-x 몫 + eras 위성 연대 띠). 색은 토큰 var() 그대로 — PNG 로 낼 때 png.ts 가 값으로 바꾼다.
 * 칸 모양: 범위 밖·운용 전 = 바탕 + 가는 가로선 · 결측 = 빗금 · 진행 중 = 점선 테두리 · NRT = 오른쪽 위 속 빈 삼각 · 0 = 「0」.
 */
export const C = {
  ink: "var(--text-1)",
  muted: "var(--text-2)",
  dim: "var(--text-3)",
  line: "var(--line-soft)",
  line2: "var(--line-strong)",
  bg: "var(--surface-0)",
  signal: "var(--accent)",
  zero: "var(--data-zero)",
  onWarm: "var(--on-warm)",
  hatchBg: "var(--hatch-bg)",
  base: "var(--data-base)",
  viirs: "var(--data-viirs)",
  ybEvalInk: "var(--yb-eval-ink)",
};
const MONO = "Pretendard Variable, Pretendard, Malgun Gothic, sans-serif";
const SANS = "Pretendard Variable, Pretendard, Malgun Gothic, sans-serif";
const KO = /[가-힣]/;
const SATS = [
  { sat: "Terra", short: "T", sensor: "MODIS", start: "2000-02-24" },
  { sat: "Aqua", short: "A", sensor: "MODIS", start: "2002-07-04" },
  { sat: "S-NPP", short: "S", sensor: "VIIRS", start: "2012-01-19" },
  { sat: "NOAA-20", short: "N20", sensor: "VIIRS", start: "2018-01-05" },
  { sat: "NOAA-21", short: "N21", sensor: "VIIRS", start: "2023-02-10" },
];

export function Tx({ x, y, s, anchor, fill = C.muted, weight, cls }: { x: number; y: number; s: string | number; anchor?: "start" | "middle" | "end"; fill?: string; weight?: string; cls?: string }) {
  const ko = KO.test(String(s));
  return (
    <text x={x} y={y} textAnchor={anchor} fill={fill} fontFamily={ko ? SANS : MONO} className={cx(ko ? "t-ko" : null, cls ?? null) || undefined} fontSize="11" fontWeight={weight}>
      {s}
    </text>
  );
}

export interface CalSvgProps {
  rows: GridRow[];
  cs: number;
  ramp: (t: number) => string;
  scaleMax: number | null;
  yearEvery: number;
  eras?: boolean;
  keyboard?: boolean;
  highlight?: { y: number; m: number } | null;
  showValues?: (y: number) => boolean;
  fmtVal?: (v: number) => string;
  bands?: (Band & { label: string })[];
  cellTitle?: (y: number, m: number) => string;
  label: string;
  /** 개수 띠 고르기: 맞지 않는 칸은 바탕 덮개 */
  only?: string | null;
  onPick?: (y: number, m: number) => void;
  erasLabel?: string;
  eraTip?: (sat: string, ym: string) => string;
  /** 띠 아래 글자(구간 이름)를 그릴지 */
  bandText?: boolean;
  hidden?: boolean;
  /** 값 0 칸에 「0」 */
  zeroMark?: boolean;
  /** 연대 띠가 없을 때 VIIRS 시작(2012) 점선 */
  viirsStart?: string;
}

export const CalSvg = forwardRef<SVGSVGElement, CalSvgProps>(function CalSvg(o, ref) {
  const hid = `cal${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const years = o.rows.map((r) => r.year);
  const cs = o.cs;
  const gap = 2;
  const ERA = o.eras ? 24 : 0;
  const padL = 34;
  const padT = 22 + ERA;
  const nY = years.length;
  const gridW = nY * (cs + gap);
  const gridH = 12 * (cs + gap);
  const W = padL + gridW + 8;
  const H = padT + gridH + (o.bands ? 20 : 6);
  const smax = o.scaleMax || 1;
  const tv = (v: number) => Math.sqrt(Math.min(1, v / smax));
  const pos = (yi: number, m: number) => [padL + yi * (cs + gap), padT + (m - 1) * (cs + gap)] as const;
  const kb = !!o.keyboard;
  const hl = o.highlight;
  const startKey = hl ? `${hl.y}-${hl.m}` : null;

  const cells: React.ReactNode[] = [];
  o.rows.forEach((row, yi) => {
    const g: React.ReactNode[] = [];
    row.cs.forEach((c, mi) => {
      const m = mi + 1;
      const [x, y] = pos(yi, m);
      const key = `${row.year}-${m}`;
      const tl = o.cellTitle ? o.cellTitle(row.year, m) : key;
      const isHl = !!hl && hl.y === row.year && hl.m === m;
      const a11y = kb ? { role: "gridcell", tabIndex: key === startKey ? 0 : -1, "aria-label": tl } : {};
      if (c.st === "out_of_range" || c.st === "before_sensor") {
        g.push(
          <g key={key}>
            <rect className={cx(c.st === "before_sensor" ? "cal-o cal-b" : "cal-o")} data-y={row.year} data-m={m} x={x} y={y} width={cs} height={cs} rx={3} fill={C.bg} stroke={C.line} strokeWidth={1} {...a11y}>
              <title>{tl}</title>
            </rect>
            <line x1={(x + cs * 0.25).toFixed(1)} x2={(x + cs * 0.75).toFixed(1)} y1={y + cs / 2} y2={y + cs / 2} stroke={C.line2} strokeWidth={1} pointerEvents="none" />
            {isHl ? <rect x={x - 1.5} y={y - 1.5} width={cs + 3} height={cs + 3} rx={4} fill="none" stroke={C.signal} strokeWidth={2} pointerEvents="none" /> : null}
          </g>,
        );
        return;
      }
      if (c.value == null) {
        g.push(
          <g key={key}>
            <rect className={cx("cal-x")} data-y={row.year} data-m={m} x={x} y={y} width={cs} height={cs} rx={3} fill={`url(#${hid})`} stroke={C.dim} strokeWidth={1} {...(kb ? a11y : { tabIndex: -1 })}>
              <title>{tl}</title>
            </rect>
            {isHl ? <rect x={x - 1.5} y={y - 1.5} width={cs + 3} height={cs + 3} rx={4} fill="none" stroke={C.signal} strokeWidth={2} pointerEvents="none" /> : null}
          </g>,
        );
        return;
      }
      const v = c.value;
      const partial = c.st === "partial";
      const sv = o.showValues ? o.showValues(row.year) : false;
      const tt = v === 0 ? 0 : tv(v);
      const txt = o.fmtVal ? o.fmtVal(v) : String(v);
      const fs = Math.max(7.5, Math.min(11, cs * 0.5));
      const room = cs - 4;
      const fit = txt.length * fs * 0.62 > room ? { textLength: room.toFixed(1), lengthAdjust: "spacingAndGlyphs" as const } : {};
      const k = Math.max(4, cs * 0.3);
      const inkOn = v !== 0 && tt > 0.62 ? C.onWarm : C.ink;
      g.push(
        <g key={key}>
          <rect
            className={cx("cal-c")}
            data-y={row.year}
            data-m={m}
            data-v={v}
            x={x}
            y={y}
            width={cs}
            height={cs}
            rx={3}
            fill={v === 0 ? C.zero : o.ramp(tt)}
            fillOpacity={partial ? 0.85 : undefined}
            aria-selected={isHl ? "true" : undefined}
            {...(kb ? a11y : { tabIndex: -1 })}
          >
            <title>{tl}</title>
          </rect>
          {o.zeroMark && v === 0 && !sv ? (
            <text x={x + cs / 2} y={y + cs / 2 + 3.4} textAnchor="middle" fontFamily={MONO} fontSize={Math.max(7.5, Math.min(10, cs * 0.45)).toFixed(1)} fill={C.muted} pointerEvents="none" aria-hidden="true">
              0
            </text>
          ) : null}
          {sv ? (
            <text x={x + cs / 2} y={y + cs / 2 + fs * 0.36} textAnchor="middle" fontFamily={MONO} fontSize={fs.toFixed(1)} {...fit} fill={tt > 0.62 ? C.onWarm : C.ink} className={cx("cal-v")} style={{ fill: tt > 0.62 ? C.onWarm : C.ink }} fillOpacity={0.88} pointerEvents="none">
              {txt}
            </text>
          ) : null}
          {partial ? <rect x={x + 0.75} y={y + 0.75} width={cs - 1.5} height={cs - 1.5} rx={2.5} fill="none" stroke={C.ink} strokeWidth={1.5} strokeDasharray="3 2" pointerEvents="none" /> : null}
          {c.st === "nrt" ? (
            <path d={`M${(x + cs - 1.5).toFixed(1)} ${y + 1.5}h${(-k).toFixed(1)}L${(x + cs - 1.5).toFixed(1)} ${(y + 1.5 + k).toFixed(1)}Z`} fill="none" stroke={inkOn} strokeWidth={1} pointerEvents="none" />
          ) : null}
          {isHl ? <rect x={x - 1.5} y={y - 1.5} width={cs + 3} height={cs + 3} rx={4} fill="none" stroke={C.signal} strokeWidth={2} pointerEvents="none" /> : null}
        </g>,
      );
    });
    cells.push(
      kb ? (
        <g key={row.year} role="row" aria-label={String(row.year)}>
          {g}
        </g>
      ) : (
        <g key={row.year}>{g}</g>
      ),
    );
  });

  /* 개수 띠 고르기: 다른 칸을 바탕색 덮개로 낮춘다 */
  const quiet: React.ReactNode[] = [];
  if (o.only) {
    o.rows.forEach((row, yi) =>
      row.cs.forEach((c, mi) => {
        const hit = o.only === "interval_out" ? c.io : c.st === o.only;
        if (hit) return;
        const [x, y] = pos(yi, mi + 1);
        quiet.push(<rect key={`q${row.year}-${mi}`} x={x} y={y} width={cs} height={cs} fill={C.bg} fillOpacity={0.7} />);
      }),
    );
  }

  /* 값 출처 띠(칸 바로 아래 4px) */
  const bands: React.ReactNode[] = [];
  if (o.bands) {
    const by = padT + gridH + 1;
    const xo = (t: number) => padL + (t - (years[0] ?? 2000)) * (cs + gap);
    o.bands.forEach((b, i) => {
      const x0 = Math.max(padL, xo(yfOf(b.from)));
      const x1 = Math.min(padL + gridW - gap, xo(yfOf(b.to, true)));
      if (!(x1 > x0)) return;
      const cls = vsCls(b.vs);
      const fill = cls === "a" || cls === "d" ? `url(#${hid})` : cls === "b" ? C.muted : "none";
      bands.push(
        <g key={`b${i}`}>
          <rect className={cx("cal-band")} x={x0.toFixed(1)} y={by} width={(x1 - x0).toFixed(1)} height={4} fill={fill} stroke={cls === "b" ? C.muted : C.ink} strokeWidth={cls === "c" ? 1 : 0.6} strokeDasharray={cls === "d" ? "2 1.5" : undefined} data-vs={b.vs}>
            <title>{b.label}</title>
          </rect>
          {o.bandText !== false && x1 - x0 > b.label.length * 6.4 + 8 ? <Tx x={x0 + 1} y={by + 14} s={b.label} /> : null}
        </g>,
      );
    });
  }

  /* 위성 연대 띠 */
  const eras: React.ReactNode[] = [];
  if (ERA) {
    const x0 = padL;
    const x1 = padL + gridW - gap;
    const yf = (d: string) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12;
    const xOf = (yv: number) => padL + (yv - (years[0] ?? 2000)) * (cs + gap);
    eras.push(<line key="ax" x1={x0} x2={x1} y1={2 + 8 - 0.5} y2={2 + 8 - 0.5} stroke="var(--cosmo-tick)" />);
    let lastEnd = -1e9;
    SATS.forEach((q) => {
      const xr = Math.round(Math.max(x0, xOf(yf(q.start)))) + 0.5;
      const tip = o.eraTip ? o.eraTip(q.sat, q.start.slice(0, 7)) : q.sat;
      eras.push(
        <line key={`t${q.sat}`} x1={xr} x2={xr} y1={2} y2={10} stroke="var(--cosmo-orbit)" strokeWidth={q.sensor === "VIIRS" ? 2 : 1}>
          <title>{tip}</title>
        </line>,
      );
      const name = [q.sat, q.short].find((nm) => xr >= lastEnd + 6 && xr + nm.length * 6.8 <= W - 2);
      if (name) {
        lastEnd = xr + name.length * 6.8;
        eras.push(
          <g key={`l${q.sat}`}>
            <title>{tip}</title>
            <Tx x={+xr.toFixed(1)} y={2 + 8 + 12} s={name} fill="var(--cosmo-label)" />
          </g>,
        );
      }
    });
  }

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const t = (e.target as Element).closest("[data-y][data-m]") as SVGElement | null;
    if (t && o.onPick) o.onPick(+(t.dataset.y ?? 0), +(t.dataset.m ?? 0));
  };
  /* 로빙 tabindex: ←→ 연도 · ↑↓ 달 · Home/End · Enter 로 선택 */
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const c = e.target as SVGElement;
    if (!c.dataset?.y) return;
    const svg = e.currentTarget;
    const at = (y: number, m: number) => svg.querySelector<SVGElement>(`[role="gridcell"][data-y="${y}"][data-m="${m}"]`);
    const yi = years.indexOf(+c.dataset.y);
    const m = +(c.dataset.m ?? 1);
    const K = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    const move = (to: SVGElement | null) => {
      if (!to) return;
      c.setAttribute("tabindex", "-1");
      to.setAttribute("tabindex", "0");
      to.focus({ preventScroll: true });
    };
    const seek = (y0: number, m0: number, dy: number, dm: number) => {
      let a = y0;
      let b = m0;
      for (let k = 0; k < 400; k++) {
        a += dy;
        b += dm;
        if (a < 0 || a >= years.length || b < 1 || b > 12) return null;
        const hit = at(years[a] as number, b);
        if (hit) return hit;
      }
      return null;
    };
    if (K) {
      e.preventDefault();
      move(seek(yi, m, K[0], K[1]));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      move(e.key === "Home" ? seek(-1, m, 1, 0) : seek(years.length, m, -1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (o.onPick) o.onPick(+c.dataset.y, m);
    }
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      style={{ fontVariantNumeric: "tabular-nums", width: W }}
      role={kb ? "grid" : "img"}
      aria-label={`${o.label} ${years[0]}–${years[years.length - 1]}`}
      aria-hidden={o.hidden ? "true" : undefined}
      onClick={o.onPick ? onClick : undefined}
      onKeyDown={kb ? onKey : undefined}
    >
      <defs>
        <pattern id={hid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={C.hatchBg} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={C.dim} strokeWidth="1.6" />
        </pattern>
      </defs>
      {years.map((y, i) => ((o.yearEvery > 2 ? (years.length - 1 - i) % o.yearEvery === 0 : i % o.yearEvery === 0 || i === years.length - 1) ? <Tx key={`y${y}`} x={padL + i * (cs + gap) + cs / 2} y={padT - 7} s={`'${String(y).slice(2)}`} anchor="middle" /> : null))}
      {Array.from({ length: 12 }, (_, i) => (
        <Tx key={`m${i}`} x={padL - 6} y={padT + i * (cs + gap) + cs / 2 + 3.5} s={i + 1} anchor="end" />
      ))}
      {cells}
      {quiet.length ? (
        <g pointerEvents="none" aria-hidden="true">
          {quiet}
        </g>
      ) : null}
      {bands}
      {!ERA && o.viirsStart && years.indexOf(2012) > 0
        ? (() => {
            const x = padL + years.indexOf(2012) * (cs + gap) - gap / 2 - 0.5;
            return <line x1={x} y1={padT - 2} x2={x} y2={padT + gridH} stroke={C.signal} strokeWidth={1} strokeDasharray="3 3" />;
          })()
        : null}
      {ERA ? (
        <g role="img" aria-label={o.erasLabel}>
          {eras}
        </g>
      ) : null}
    </svg>
  );
});
