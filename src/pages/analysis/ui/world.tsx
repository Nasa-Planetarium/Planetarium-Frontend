"use client";

import { WorldReplay as Base, type WorldReplayProps } from "@/widgets/world-replay";
import { calendarAllQuery } from "../api/queries";
import { Status, Verdict } from "./bits";
import { cx } from "./cx";

type Own = Omit<WorldReplayProps, "cx" | "Status" | "Verdict" | "ns" | "rowsQuery">;

/** 전 세계 1° 월별 재생(목업 analysis.js mountWorld · EM.worldFire) — 분석 CSS·낱말(analysis.w1)·나라 행 질의를 끼운다 */
export function WorldReplay(o: Own) {
  return <Base {...o} cx={cx} Status={Status} Verdict={Verdict} ns="analysis.w1" rowsQuery={calendarAllQuery} />;
}
