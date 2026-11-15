"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { BarPaintDefs, topRoundPath } from "@/shared/ui";
import { eraPlace, FIRST_YEAR, niceMax, SATS, type Cell, type Sensor } from "../model/home";
import { cx } from "./cx";
import type { Fmt, Tok } from "./use-ui";

/* 목업 charts.js 의 SVG 차트를 React 로(색은 토큰 값을 속성으로 — PNG 내보내기에서도 같은 색). 글자 = Pretendard(숫자·한글 모두) */
const MONO = "Pretendard Variable, Pretendard, Malgun Gothic, sans-serif";
const SANS = "Pretendard Variable, Pretendard, Malgun Gothic, sans-serif";
const KO = /[가-힣]/;
function Tx({ x, y, children, fill, anchor }: { x: number | string; y: number | string; children: ReactNode; fill: string; anchor?: "start" | "middle" | "end" }) {
  const ko = KO.test(String(children));
  return (
    <text x={x} y={y} textAnchor={anchor} fill={fill} fontFamily={ko ? SANS : MONO} fontSize={11}>
      {children}
    </text>
  );
}

export const CAL = { padL: 34, era: 24, gap: 2 };

/**
 * 관측 활동 캘린더(목업 EM.charts.calendar orient years-x · eras · 홈은 아래 범례를 HTML 로 따로 그린다).
 * 칸 상태 모양: out_of_range·before_sensor = 바탕 + 가는 가로선 · missing = 빗금 · partial = 점선 테두리 · nrt = 오른쪽 위 속 빈 삼각 · 0 = data-zero.
 * 「같은 달 중앙값의 2배 이상」 점 = release ratio_to_median(다시 계산하지 않음).
 */
export function CalendarSvg(p: {
  g: Cell[][];
  cs: number;
  sensor: Sensor;
  scaleMax: number;
  highlight: { year: number; month: number } | null;
  focus: { year: number; month: number } | null;
  showValues: boolean;
  tok: Tok;
  ramp: (t: number) => string;
  fmt: Fmt;
  label: string;
  cellTitle: (c: Cell) => string;
  onCell: (y: number, m: number) => void;
  onFocus: (y: number, m: number) => void;
  eraTip: (sat: string, sensor: string, start: string) => string;
  eraLabel: string;
  maxW?: number;
}) {
  const hid = useId().replace(/:/g, "");
  const { cs, tok: C } = p;
  const gap = CAL.gap;
  const padL = CAL.padL;
  const padT = 22 + CAL.era;
  const years = p.g.map((r) => r[0]?.year ?? FIRST_YEAR);
  const gridW = years.length * (cs + gap);
  const gridH = 12 * (cs + gap);
  const W0 = padL + gridW + 8;
  const H = padT + gridH + 18;
  const tv = (v: number) => Math.sqrt(Math.min(1, v / p.scaleMax));
  const pos = (yi: number, m: number) => [padL + yi * (cs + gap), padT + (m - 1) * (cs + gap)] as const;
  /* 연대 띠 */
  const x0 = padL;
  const x1 = padL + gridW - gap;
  const xOf = (yf: number) => padL + (yf - years[0]!) * (cs + gap);
  const yf = (d: string) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12;
  const xs = SATS.map((q) => xOf(yf(q.start)));
  const pre = SATS.filter((_, i) => xs[i]! < x0 - 0.5);
  const xMax = W0 + 16;
  const items: { x: number; pin?: boolean; vars: string[]; title: string }[] = [];
  if (pre.length) {
    const q = pre[pre.length - 1]!;
    const yr = ` ←${q.start.slice(0, 4)}`;
    items.push({ x: Math.round(x0) + 0.5, pin: true, vars: [q.sat + yr, q.short + yr, q.short], title: pre.map((s) => p.eraTip(s.sat, s.sensor, s.start)).join(" · ") });
  }
  SATS.forEach((q, i) => {
    if (xs[i]! >= x0 - 0.5 && xs[i]! <= x1 + 0.5) items.push({ x: Math.round(xs[i]!) + 0.5, vars: [q.sat, q.short], title: p.eraTip(q.sat, q.sensor, q.start) });
  });
  const placed = eraPlace(items, { left: x0, right: xMax, width: (t) => t.length * 6.8, pad: 3, gap: 6 });
  const W = Math.ceil(Math.max(W0, padL + gridW - gap + cs / 2 + 14, ...placed.map((q) => q.l + q.txt.length * 6.8 + 4)));
  const w = p.maxW && !p.showValues && W > p.maxW ? p.maxW : W;
  const h = Math.round((H * w) / W);

  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const f = p.focus;
    if (!f) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      p.onCell(f.year, f.month);
      return;
    }
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const s = step[e.key];
    if (!s) return;
    e.preventDefault();
    let y = f.year + s[0];
    let m = f.month + s[1];
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    if (y < years[0]! || y > years[years.length - 1]!) return;
    p.onFocus(y, m);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={w} height={h} role="grid" aria-label={p.label} style={{ fontVariantNumeric: "tabular-nums" }} onKeyDown={key}>
      <defs>
        <pattern id={hid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={C["hatch-bg"]} />
          <line x1="0" y1="0" x2="0" y2="5" stroke={C["text-3"]} strokeWidth="1.6" />
        </pattern>
      </defs>
      {years.map((y, i) =>
        i % 5 === 0 || i === years.length - 1 ? (
          <Tx key={`y${y}`} x={padL + i * (cs + gap) + cs / 2} y={padT - 7} anchor="middle" fill={C["text-2"]}>
            {`'${String(y).slice(2)}`}
          </Tx>
        ) : null,
      )}
      {Array.from({ length: 12 }, (_, i) => (
        <Tx key={`m${i}`} x={padL - 6} y={padT + i * (cs + gap) + cs / 2 + 3.5} anchor="end" fill={C["text-2"]}>
          {i + 1}
        </Tx>
      ))}
      {p.g.map((row, yi) => (
        <g key={row[0]?.year ?? yi} role="row" aria-label={String(row[0]?.year ?? "")}>
          {row.map((c) => {
            const [x, y] = pos(yi, c.month);
            const tl = p.cellTitle(c);
            const hl = !!p.highlight && p.highlight.year === c.year && p.highlight.month === c.month;
            const fo = !!p.focus && p.focus.year === c.year && p.focus.month === c.month;
            const a11y = { role: "gridcell", tabIndex: fo ? 0 : -1, "aria-label": tl, "aria-selected": hl || undefined, onClick: () => p.onCell(c.year, c.month) } as const;
            if (c.st === "out_of_range" || c.st === "before_sensor") {
              return (
                <g key={c.month}>
                  <rect className={cx(c.st === "before_sensor" ? "cal-o cal-b" : "cal-o")} data-y={c.year} data-m={c.month} x={x} y={y} width={cs} height={cs} rx={3} fill={C["surface-0"]} stroke={C["line-soft"]} strokeWidth={1} {...a11y}>
                    <title>{tl}</title>
                  </rect>
                  <line x1={(x + cs * 0.25).toFixed(1)} x2={(x + cs * 0.75).toFixed(1)} y1={y + cs / 2} y2={y + cs / 2} stroke={C["line-strong"]} strokeWidth={1} pointerEvents="none" />
                </g>
              );
            }
            if (c.v == null) {
              return (
                <g key={c.month}>
                  <rect className={cx("cal-x")} data-y={c.year} data-m={c.month} x={x} y={y} width={cs} height={cs} rx={3} fill={c.st === "missing" ? `url(#${hid})` : "none"} stroke={c.st === "missing" ? C["text-3"] : C["line-soft"]} strokeWidth={1} strokeDasharray={c.st === "missing" ? undefined : "2 2"} {...a11y}>
                    <title>{tl}</title>
                  </rect>
                  {hl ? <rect x={x - 1.5} y={y - 1.5} width={cs + 3} height={cs + 3} rx={4} fill="none" stroke={C.accent} strokeWidth={2} pointerEvents="none" /> : null}
                </g>
              );
            }
            const v = c.v;
            const t = v === 0 ? 0 : tv(v);
            const partial = c.st === "partial";
            const anomaly = p.sensor === "harmonized" && (c.ratio ?? 0) >= 2 && v >= 10;
            const small = (p.sensor === "harmonized" || p.sensor === "modis") && c.year < 2012 && v === 0;
            const fs = Math.max(7.5, Math.min(11, cs * 0.5));
            const txt = v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(v));
            const room = cs - 4;
            const k = Math.max(4, cs * 0.3);
            const ink = v !== 0 && t > 0.62 ? C["on-warm"] : C["text-1"];
            return (
              <g key={c.month}>
                <rect className={cx("cal-c")} data-y={c.year} data-m={c.month} data-v={v} x={x} y={y} width={cs} height={cs} rx={3} fill={v === 0 ? C["data-zero"] : p.ramp(t)} fillOpacity={partial ? 0.85 : undefined} {...a11y}>
                  <title>{tl}</title>
                </rect>
                {small ? <path d={`M${x + 1.5} ${y + 1.5}h${(cs * 0.3).toFixed(1)}L${x + 1.5} ${(y + 1.5 + cs * 0.3).toFixed(1)}Z`} fill={C["data-modis"]} fillOpacity={0.9} pointerEvents="none" /> : null}
                {p.showValues ? (
                  <text x={x + cs / 2} y={y + cs / 2 + fs * 0.36} textAnchor="middle" fontFamily={MONO} fontSize={fs.toFixed(1)} {...(txt.length * fs * 0.62 > room ? { textLength: room.toFixed(1), lengthAdjust: "spacingAndGlyphs" } : {})} fill={t > 0.62 ? C["on-warm"] : C["text-1"]} fillOpacity={0.88} pointerEvents="none">
                    {txt}
                  </text>
                ) : null}
                {partial ? <rect x={x + 0.75} y={y + 0.75} width={cs - 1.5} height={cs - 1.5} rx={2.5} fill="none" stroke={C["text-1"]} strokeWidth={1.5} strokeDasharray="3 2" pointerEvents="none" /> : null}
                {c.st === "nrt" ? <path d={`M${(x + cs - 1.5).toFixed(1)} ${y + 1.5}h${(-k).toFixed(1)}L${(x + cs - 1.5).toFixed(1)} ${(y + 1.5 + k).toFixed(1)}Z`} fill="none" stroke={ink} strokeWidth={1} pointerEvents="none" /> : null}
                {anomaly ? <circle cx={x + cs - 5} cy={y + 5} r={2.6} fill={C["text-1"]} pointerEvents="none" /> : null}
                {hl ? <rect x={x - 1.5} y={y - 1.5} width={cs + 3} height={cs + 3} rx={4} fill="none" stroke={C.accent} strokeWidth={2} pointerEvents="none" /> : null}
              </g>
            );
          })}
        </g>
      ))}
      <g role="img" aria-label={p.eraLabel}>
        <line x1={x0} x2={x1} y1={2 + 8 - 0.5} y2={2 + 8 - 0.5} stroke={C["cosmo-tick"]} />
        {pre.length ? (
          <line x1={Math.round(x0) + 0.5} x2={Math.round(x0) + 0.5} y1={2} y2={10} stroke={C["cosmo-orbit"]} strokeWidth={1}>
            <title>{items[0]?.title}</title>
          </line>
        ) : null}
        {SATS.map((q, i) =>
          xs[i]! >= x0 - 0.5 && xs[i]! <= x1 + 0.5 ? (
            <line key={q.sat} x1={Math.round(xs[i]!) + 0.5} x2={Math.round(xs[i]!) + 0.5} y1={2} y2={10} stroke={C["cosmo-orbit"]} strokeWidth={q.sensor === "VIIRS" ? 2 : 1}>
              <title>{p.eraTip(q.sat, q.sensor, q.start)}</title>
            </line>
          ) : null,
        )}
        {placed.map((q) => (
          <g key={q.i}>
            <title>{items[q.i]?.title}</title>
            <Tx x={q.l.toFixed(1)} y={22} fill={C["cosmo-label"]}>
              {q.txt}
            </Tx>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** 일별 막대(목업 EM.charts.days) — 값 = /summary freq=day 의 날 값 그대로. 결측 날은 점선 빈 칸 */
export function DaysSvg(p: {
  days: { day: number; value: number | null; fires: string[] }[];
  width: number;
  height: number;
  median: number | null;
  highlight: number | null;
  tok: Tok;
  ramp: (t: number) => string;
  fmt: Fmt;
  label: string;
  dayTitle: (d: { day: number; value: number | null }) => string;
  fireTitle: (ids: string[]) => string;
  onDay: (d: number) => void;
  /** 전년 같은 달 일별(목업 daysYoY) — 점선 회색 · 축 최대를 둘 다로 */
  prev?: (number | null)[] | null;
  prevTitle?: string;
}) {
  const { tok: C } = p;
  const W = p.width;
  const H = p.height;
  const pl = 34;
  const pr = 8;
  const pt = 16;
  const pb = 22;
  const vals = p.days.map((d) => d.value ?? 0);
  const pv = (p.prev ?? []).filter((v): v is number => v != null);
  const ph = H - pt - pb;
  const tn = ph >= 54 ? 3 : ph >= 26 ? 2 : 1;
  const mx = niceMax(Math.max(4, ...vals, ...pv));
  const step = mx / tn;
  const ticks = Array.from({ length: tn + 1 }, (_, i) => +(i * step).toFixed(6));
  const n = Math.max(1, p.days.length, p.prev?.length ?? 0);
  const bw = (W - pl - pr) / n;
  const X = (i: number) => pl + i * bw;
  const Y = (v: number) => pt + (1 - v / mx) * (H - pt - pb);
  const pid = `dy${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const MH = Math.min(10, H - pt - pb);
  const hiD = p.highlight != null ? p.days.find((d) => d.day === p.highlight && d.value != null) : undefined;
  /* 전년 선: 막대 가운데를 잇고 결측 날은 끊는다 */
  let dp = "";
  let pen = false;
  (p.prev ?? []).forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    dp += `${pen ? "L" : "M"}${(X(i) + bw / 2).toFixed(1)} ${Y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={p.label} style={{ fontVariantNumeric: "tabular-nums" }}>
      <defs>
        <BarPaintDefs id={pid} />
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C["line-strong"] : C["line-soft"]} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <Tx x={pl - 5} y={Y(v) + 3.5} anchor="end" fill={C["text-2"]}>
            {p.fmt.axis(v, 1e3)}
          </Tx>
        </g>
      ))}
      {p.median != null ? <line x1={pl} x2={W - pr} y1={Y(p.median)} y2={Y(p.median)} stroke={C["text-1"]} strokeDasharray="4 3" strokeOpacity={0.6} /> : null}
      {p.days.map((d, i) => {
        const x = X(i) + 1;
        const w = Math.max(2, bw - 2);
        return (
          <g key={d.day}>
            {d.value == null ? (
              <rect x={x} y={Y(0) - MH} width={w} height={MH} fill={`url(#${pid}h)`} fillOpacity={0.8}>
                <title>{p.dayTitle(d)}</title>
              </rect>
            ) : (
              <path className={cx("day-c")} data-d={d.day} data-hi={p.highlight === d.day ? "1" : undefined} d={topRoundPath(x, Y(d.value), w, Math.max(0.5, Y(0) - Y(d.value)), Math.min(2.5, w / 3))} fill={`url(#${pid}${p.highlight === d.day ? "e" : "b"})`} filter={p.highlight === d.day ? `url(#${pid}g)` : undefined} style={{ cursor: "pointer" }} onClick={() => p.onDay(d.day)}>
                <title>{p.dayTitle(d)}</title>
              </path>
            )}
            {d.fires.length ? (
              <circle cx={x + w / 2} cy={pt - 7} r={3} fill={C["data-viirs"]}>
                <title>{p.fireTitle(d.fires)}</title>
              </circle>
            ) : null}
            {d.day === 1 || d.day % 5 === 0 ? (
              <Tx x={(x + w / 2).toFixed(1)} y={H - 7} anchor="middle" fill={C["text-2"]}>
                {d.day}
              </Tx>
            ) : null}
          </g>
        );
      })}
      {hiD && hiD.value ? (
        <text x={(X(p.days.indexOf(hiD)) + bw / 2).toFixed(1)} y={Math.max(11, Y(hiD.value) - 5).toFixed(1)} textAnchor="middle" fontFamily={MONO} fontSize="12" fontWeight="700" style={{ fill: "var(--yb-eval-ink)" }} pointerEvents="none">
          {p.fmt.axis(hiD.value, 1e9)}
        </text>
      ) : null}
      {dp ? (
        <path d={dp} fill="none" stroke={C["text-2"]} strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" opacity={0.95} data-prev="">
          <title>{p.prevTitle}</title>
        </path>
      ) : null}
    </svg>
  );
}

/** 작은 선(목업 EM.charts.spark) — 결측은 잇지 않는다 */
export function Spark({ vals, w, h, color }: { vals: (number | null)[]; w: number; h: number; color: string }) {
  const v = vals.filter((x): x is number => x != null);
  const mx = Math.max(...v, 1);
  const X = (i: number) => 1 + (i / Math.max(1, vals.length - 1)) * (w - 4);
  const Y = (y: number) => h - 2 - (y / mx) * (h - 6);
  const segs: { i: number; y: number }[][] = [];
  let cur: { i: number; y: number }[] = [];
  vals.forEach((y, i) => {
    if (y == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push({ i, y });
  });
  if (cur.length) segs.push(cur);
  const path = (g: { i: number; y: number }[]) => g.map((q, k) => `${k ? "L" : "M"}${X(q.i).toFixed(1)} ${Y(q.y).toFixed(1)}`).join("");
  const li = vals.length - 1;
  const last = vals[li];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {segs.map((g, k) => (
        <path key={k} d={`${path(g)}L${X(g[g.length - 1]!.i).toFixed(1)} ${h}L${X(g[0]!.i).toFixed(1)} ${h}Z`} fill={color} fillOpacity={0.12} />
      ))}
      <path d={segs.map(path).join("")} fill="none" stroke={color} strokeWidth={1.6} />
      {last != null ? <circle cx={X(li)} cy={Y(last)} r={2.5} fill={color} /> : null}
    </svg>
  );
}

/** 연간 합계 선(목업 EM.charts.line 의 홈 몫) — 2012 VIIRS 시작 표지 + 가장 많은 해 표지 */
export function AnnualLine(p: { pts: { x: number; y: number }[]; width: number; height: number; color: string; tok: Tok; fmt: Fmt; label: string; viirsLabel: string; top: number | null }) {
  const { tok: C } = p;
  const W = p.width;
  const H = p.height;
  const pl = 36;
  const pr = 8;
  const pt = 12;
  const pb = 20;
  if (!p.pts.length) return null;
  const x0 = p.pts[0]!.x;
  const x1 = p.pts[p.pts.length - 1]!.x;
  const mx = niceMax(Math.max(1, ...p.pts.map((q) => q.y)));
  const X = (x: number) => pl + ((x - x0) / Math.max(1, x1 - x0)) * (W - pl - pr);
  const Y = (v: number) => pt + (1 - v / mx) * (H - pt - pb);
  const d = p.pts.map((q, i) => `${i ? "L" : "M"}${X(q.x).toFixed(1)} ${Y(q.y).toFixed(1)}`).join("");
  const yfmt = (n: number) => (n >= 1000 ? `${p.fmt.num(n / 1000, n % 1000 ? 1 : 0)}k` : p.fmt.num(n));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={p.label} style={{ fontVariantNumeric: "tabular-nums" }}>
      {[0, mx / 2, mx].map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? C["line-strong"] : C["line-soft"]} strokeDasharray={v === 0 ? undefined : "2 3"} />
          <Tx x={pl - 5} y={Y(v) + 3.5} anchor="end" fill={C["text-2"]}>
            {yfmt(v)}
          </Tx>
        </g>
      ))}
      <path d={`${d}L${X(x1).toFixed(1)} ${Y(0)}L${X(x0).toFixed(1)} ${Y(0)}Z`} fill={p.color} fillOpacity={0.14} />
      <path d={d} fill="none" stroke={p.color} strokeWidth={1.8} />
      {x0 <= 2012 && x1 >= 2012 ? (
        <g>
          <line x1={X(2012)} x2={X(2012)} y1={pt} y2={H - pb} stroke={C["text-2"]} strokeDasharray="3 3" />
          <Tx x={X(2012) + 4} y={pt + 8} fill={C["text-2"]}>
            {p.viirsLabel}
          </Tx>
        </g>
      ) : null}
      {p.top != null ? <circle cx={X(p.top)} cy={Y(p.pts.find((q) => q.x === p.top)?.y ?? 0)} r={3.5} fill={C["data-viirs"]} /> : null}
      {p.pts.map((q) =>
        (q.x - x0) % 4 === 0 ? (
          <Tx key={q.x} x={X(q.x)} y={H - 6} anchor="middle" fill={C["text-2"]}>
            {String(q.x)}
          </Tx>
        ) : null,
      )}
    </svg>
  );
}
