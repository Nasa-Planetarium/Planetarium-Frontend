"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { monthSpan } from "@/entities/fire-month";
import { satDaysQuery, satDaySummary, type DaySt } from "@/entities/satellite-status";
import { ApiError } from "@/shared/api";
import { useT } from "@/shared/i18n";
import s from "./fire-month.module.css";

const cx = (...n: (string | false | null | undefined)[]) =>
  n
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .map((k) => s[k])
    .filter(Boolean)
    .join(" ");

const SHOW_OFF = 4;
const ORDER: DaySt[] = ["ok", "low", "missing", "partial"];

/**
 * 선택 달의 위성 일별 상태(계약 GET /satellite-status?freq=day — release satellite_day_status). 날짜는 UTC.
 * 위성마다 ok · 낮음 · 결측 · 일부 날 수 + ok 아닌 날 몇 개. 상태는 파일 값 그대로.
 */
export function SatDays({ ym, mv, testId = "sat-days" }: { ym: string; mv: string | null; testId?: string }) {
  const t = useT();
  const lang = useLocale();
  const V = (k: string, v?: Record<string, string | number>) => t(`v12frs.${k}`, v);
  const { start, end } = monthSpan(ym);
  const q = useQuery(satDaysQuery(start, end, mv));
  const rows = useMemo(() => satDaySummary(q.data?.days), [q.data]);
  const md = (d: string) => (lang === "ko" ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : d.slice(5));
  const err = q.error instanceof ApiError && q.error.code === "data_not_loaded" ? V("err_not_loaded") : V("err_other");

  return (
    <div className={cx("fm")} data-testid={testId} data-ready={q.isPending ? "0" : "1"}>
      <div className={cx("fm-part")}>
        <span className={cx("fm-pk")}>
          {V("sat_title")} <span className={cx("fm-sub")}>UTC</span>
        </span>
        {q.isPending ? (
          <p className={cx("fm-na")}>…</p>
        ) : q.isError ? (
          <p className={cx("fm-na")}>{err}</p>
        ) : !rows.length ? (
          <p className={cx("fm-na")}>{V("sat_none")}</p>
        ) : (
          <dl className={cx("fm-sat")}>
            {rows.map((r) => (
              <div key={r.satellite} data-sat={r.satellite}>
                <dt>{r.satellite}</dt>
                <dd>
                  {ORDER.filter((k) => r.counts[k] > 0).map((k) => (
                    <span key={k} className={cx("fm-st")} data-st={k}>
                      <i aria-hidden="true" />
                      {V(`st.${k}`)} {r.counts[k]}
                    </span>
                  ))}
                  {r.off.length ? (
                    <span className={cx("fm-off")} data-off={r.off.length}>
                      {r.off
                        .slice(0, SHOW_OFF)
                        .map((o) => md(o.date))
                        .join(" · ")}
                      {r.off.length > SHOW_OFF ? ` ${V("more", { n: r.off.length - SHOW_OFF })}` : ""}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
