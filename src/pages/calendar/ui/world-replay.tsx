"use client";

import { WorldReplay as Base, type WorldReplayProps } from "@/widgets/world-replay";
import { calendarAllQuery } from "../api/queries";
import { Status, Verdict } from "./bits";
import { cx } from "./cx";

type Own = Omit<WorldReplayProps, "cx" | "Status" | "Verdict" | "ns" | "rowsQuery">;

/** 전 세계 1° 재생(공통 widgets/world-replay) — 캘린더 CSS·낱말(calendar.w)·나라 행 질의를 끼운다 */
export function WorldReplay(o: Own) {
  return <Base {...o} cx={cx} Status={Status} Verdict={Verdict} ns="calendar.w" rowsQuery={calendarAllQuery} />;
}
