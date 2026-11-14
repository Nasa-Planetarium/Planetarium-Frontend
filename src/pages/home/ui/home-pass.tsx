"use client";

import { useMemo } from "react";
import { passes } from "@/entities/satellite-pass";
import type { Bbox } from "@/widgets/map-canvas";
import { cx } from "./cx";
import type { Ctx } from "./home-page";

const W = 240;
const H = 20;
const DOT = 4;
const hm = (ms: number, tz: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date(ms));

/**
 * 오늘 위성 통과 띠(목업 home.js renderTodayPass) — 지도 범례 옆. 기준점 = 지도 범위 가운데(전 지역).
 * 한국 = 오늘(KST 0–24시, 시나리오 시계) · 다른 나라 = 지금까지 24시간. 지난 통과만 틱(다음 통과는 머리줄 한 곳 — 목업 결정 7).
 * 통과 계산 = entities/satellite-pass(목업 TLE 궤도 계산 이식, 궤도 창 밖이면 띠를 숨긴다).
 */
export function HomePass({ c, view }: { c: Ctx; view: Bbox | null }) {
  const now = c.nowMs;
  const at = useMemo((): [number, number] | null => (view ? [(view[1] + view[3]) / 2, (view[0] + view[2]) / 2] : null), [view]);
  const roll = !c.kor;
  const day0 = useMemo(() => {
    if (now == null) return null;
    if (roll) return now - 86400e3;
    const d = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
    return Date.parse(`${d}T00:00:00+09:00`);
  }, [now, roll]);
  const ps = useMemo(() => (at && day0 != null && now != null ? passes(day0, roll ? now + 1 : day0 + 86400e3, at) : []), [at, day0, now, roll]);
  if (!ps.length || day0 == null || now == null) return null;
  const tz = c.kor ? "Asia/Seoul" : "UTC";
  const X = (ms: number) => ((ms - day0) / 86400e3) * (W - 2) + 1;
  const ly = Math.round(H * 0.38) + 0.5;
  const past = ps.filter((p) => p.ms <= now);
  const last = past[past.length - 1];
  const ticks: { x: number; k: number }[] = [];
  const hr0 = roll ? Math.ceil(day0 / 3600e3) * 3600e3 : day0;
  for (let t = hr0; t <= day0 + 86400e3; t += 3600e3) {
    const k = roll ? +hm(t, tz).slice(0, 2) : Math.round((t - day0) / 3600e3);
    if (k % 3 === 0) ticks.push({ x: Math.round(X(t)) + 0.5, k });
  }
  const list = past.map((p) => `${p.sat} ${hm(p.ms, tz)}`).join(", ");
  return (
    <div className={cx("hm-pass")} data-pass="">
      <span className={cx("hm-pass-k")}>
        {c.t(roll ? "home.over.passes_24h" : "home.over.passes_today")}
        <b>{c.t("home.pass.n", { n: past.length })}</b>
      </span>
      <svg className={cx("hm-pass-trk")} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={c.t("home.pass.aria", { n: past.length, list })}>
        <line className={cx("pass-ln")} x1={0} x2={W} y1={ly} y2={ly} />
        {ticks.map((q) => (
          <g key={q.x}>
            <line className={cx("pass-hr")} x1={q.x} x2={q.x} y1={ly} y2={ly + (q.k % 6 ? 2 : 4)} />
            {q.k % 6 === 0 && q.x > 10 && q.x < W - 10 ? (
              <text className={cx("pass-lb")} x={q.x} y={H - 1} textAnchor="middle">
                {String(q.k).padStart(2, "0")}
              </text>
            ) : null}
          </g>
        ))}
        {past.map((p) => {
          const mod = p.sensor === "MODIS";
          const x = Math.round(X(p.ms) - DOT / 2);
          const y = Math.round(ly - DOT / 2);
          return (
            <rect key={`${p.sat}${p.ms}`} className={cx(mod ? "pass-m" : "pass-v", p === last && "last")} x={mod ? x + 0.5 : x} y={mod ? y + 0.5 : y} width={mod ? DOT - 1 : DOT} height={mod ? DOT - 1 : DOT}>
              <title>{c.t("home.pass.title", { s: `${p.sat} ${p.sensor}`, t: hm(p.ms, tz) })}</title>
            </rect>
          );
        })}
        {now >= day0 && now < day0 + 86400e3 ? <line className={cx("pass-now")} x1={Math.round(X(now)) + 0.5} x2={Math.round(X(now)) + 0.5} y1={0} y2={ly + 4} /> : null}
      </svg>
    </div>
  );
}
