"use client";

import { useLocale } from "next-intl";
import type { SpreadNowcast } from "@/entities/spread-nowcast";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import type { SpreadHover } from "../model/use-spread-layer";

/** 날짜 글자(YYYY-MM-DD, 현지 날짜) → 「11월 13일」 / 「Nov 13」 — 날짜 글자 그대로(UTC 고정, 시간대로 옮기지 않음) */
export function shortDate(d: string | null | undefined, locale: string) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "–";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
}

const SW = { low: "bg-alert-1/40", moderate: "bg-alert-3/70", high: "bg-alert-4" } as const;
const LVS = ["low", "moderate", "high"] as const;

/**
 * 확산 nowcast 범례: 제목 · 기준일 → 목표일 · 단계 견본 · 필수 안내 문구(계약 notice — 범례에 항상).
 * 자료 없음(coverage.available=false) → 「이 지역 자료 없음」 한 줄. 범위 안인데 칸 없음 → 「오늘 감지 없음」.
 */
export function SpreadLegend({ data, pending, error, className }: { data: SpreadNowcast | null | undefined; pending?: boolean; error?: boolean; className?: string }) {
  const t = useT();
  const locale = useLocale();
  const none = data && !data.coverage.available;
  const empty = data && data.coverage.available && data.cells.length === 0;
  return (
    <div
      data-nowcast-legend=""
      data-state={error ? "error" : pending || !data ? "pending" : none ? "none" : empty ? "empty" : "ok"}
      className={cn("pointer-events-auto flex max-w-[300px] flex-col gap-1 rounded-xs border border-line-soft bg-s2 px-3 py-2 text-fs2 text-t2 shadow-elev-2", className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <b className="font-strong text-t1">{t("shell.nowcast.title")}</b>
        {data && !none ? (
          <span className="mono" data-nowcast-dates="">
            {t("shell.nowcast.dates", { a: shortDate(data.as_of_date, locale), b: shortDate(data.target_date, locale) })}
          </span>
        ) : null}
      </div>
      {error ? (
        <span role="status">{t("shell.nowcast.error")}</span>
      ) : pending || !data ? (
        <span>–</span>
      ) : none ? (
        <span role="status" data-nowcast-none="">
          {t("shell.nowcast.none")}
        </span>
      ) : empty ? (
        <span role="status" data-nowcast-empty="">
          {t("shell.nowcast.empty")}
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {LVS.map((lv) => (
            <span key={lv} className="inline-flex items-center gap-1">
              <i aria-hidden="true" className={cn("inline-block size-2.5 rounded-[1px]", SW[lv])} />
              {t(`shell.nowcast.lv.${lv}`)}
            </span>
          ))}
          <span className="mono text-t3" data-nowcast-n={data.count}>
            {t("shell.nowcast.n", { n: data.count })}
          </span>
        </div>
      )}
      {/* 필수 안내 문구(계약 notice)는 자료가 있을 때 항상 — 자료 없음이면 그 한 줄만 둔다 */}
      {/* 폰은 지도가 좁아 접어 두고 「안내」 를 눌러 편다(문구는 같은 것) */}
      {none ? null : (
        <>
          <p className="m-0 text-fs1 leading-snug text-t3 phone:hidden" data-nowcast-notice="">
            {t("shell.nowcast.notice")}
          </p>
          <details className="hidden text-fs1 text-t3 phone:block">
            <summary className="cursor-pointer">{t("shell.nowcast.notice_k")}</summary>
            <p className="m-0 mt-1 leading-snug">{t("shell.nowcast.notice")}</p>
          </details>
        </>
      )}
    </div>
  );
}

/** 칸 툴팁 — 확률 숫자는 여기에만(계약). 칸 중심 나라(cand_adm0, 한국 상자의 일본 칸 구분) */
export function SpreadTip({ hover, width }: { hover: SpreadHover; width?: number }) {
  const t = useT();
  if (!hover) return null;
  const c = hover.cell;
  return (
    <div
      role="tooltip"
      data-nowcast-tip=""
      className="pointer-events-none absolute z-10 flex flex-col gap-0.5 rounded-xs border border-line-soft bg-s2 px-2 py-1.5 text-fs2 text-t2 shadow-elev-2"
      style={{ left: Math.min(hover.x + 12, (width ?? 9999) - 220), top: hover.y + 12 }}
    >
      <b className="text-t1">
        {t("shell.nowcast.title")} · {t(`shell.nowcast.lv.${c.level}`)}
      </b>
      <span className="mono">{t("shell.nowcast.tip_p", { p: (c.p_spread * 100).toFixed(1) })}</span>
      <span>{c.active_today ? t("shell.nowcast.tip_active") : t("shell.nowcast.tip_cand")}</span>
      {c.cand_adm0 ? <span className="mono text-t3">{c.cand_adm0}</span> : null}
    </div>
  );
}
