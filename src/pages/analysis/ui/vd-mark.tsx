"use client";

import { useT } from "@/shared/i18n";
import { Verdict } from "./bits";
import { useNf } from "./charts";
import { cx } from "./cx";

/** 판정 + 백분위(목업 vdMark) — 판정 낱말은 무채, uncertain 이면 백분위를 붙이지 않는다 */
export function VdMark({ v, p }: { v: string; p: number | null }) {
  const t = useT();
  const nf = useNf();
  return (
    <span className={cx("an-vd")} data-vd={v}>
      <Verdict v={v} />
      {p != null && v !== "uncertain" ? <span className={cx("num")}>{t("analysis.g3.pct_short", { p: nf(p) })}</span> : null}
    </span>
  );
}
