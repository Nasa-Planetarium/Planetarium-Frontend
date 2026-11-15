"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { fireRegimeQuery, frpCsv, frpMonthQuery, frpSummary, isRegime, monthSpan, regimeCsv, sharePct, type Regime } from "@/entities/fire-month";
import { ApiError } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { CsvButton } from "@/shared/ui";
import s from "./fire-month.module.css";

const cx = (...n: (string | false | null | undefined)[]) =>
  n
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .map((k) => s[k])
    .filter(Boolean)
    .join(" ");

/* 배지 모양(색은 보조) — 큰 불 = 꽉 찬 불꽃, 작은 불 여러 건 = 점 셋, 섞임 = 반쯤 찬 원, 없음 = 빈 원 */
const SHAPE: Record<Regime, ReactNode> = {
  large_fire: <path d="M6 1c1.6 2 3.5 3.6 3.5 6.1A3.5 3.5 0 0 1 2.5 7.1C2.5 5.4 3.6 4.4 4.4 3.3 4.6 4.6 5.3 5 6 5.2 5.6 3.6 5.6 2.4 6 1Z" fill="currentColor" />,
  many_small: (
    <>
      <circle cx="3" cy="8" r="1.4" fill="currentColor" />
      <circle cx="6" cy="4" r="1.4" fill="currentColor" />
      <circle cx="9" cy="8" r="1.4" fill="currentColor" />
    </>
  ),
  mixed: (
    <>
      <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" />
      <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5Z" fill="currentColor" />
    </>
  ),
  none: <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeDasharray="2 1.5" />,
};

/** 오류 → 한 줄 낱말 키(처리기 맵 — switch 금지) */
const ERR_KEY: Record<string, string> = { data_not_loaded: "err_not_loaded", range_too_large: "err_wide", unknown_aoi: "err_unknown" };
const errKey = (e: unknown) => (e instanceof ApiError ? (ERR_KEY[e.code] ?? "err_other") : "err_other");

/**
 * 선택 달의 불 유형 배지(aoi_month_fire_regime) + 불 세기 FRP(S-NPP 기준, harmonized_cell_day_frp) 요약.
 * - 값은 /api/v1 응답 그대로. FRP 는 칸 목록을 Σ·max 로 묶기만 한다.
 * - 자료 없는 지역(coverage.available=false) = 「이 지역 자료 없음」 한 줄. 가짜 값·0 을 그리지 않는다.
 * - FRP 칸이 없는 달 = 「이 달 FRP 없음」(0 MW 아님).
 */
export function RegimeFrp({ aoi, ym, mv, testId = "regime-frp" }: { aoi: string; ym: string; mv: string | null; testId?: string }) {
  const t = useT();
  const lang = useLocale();
  const V = (k: string, v?: Record<string, string | number>) => t(`v12frs.${k}`, v);
  const world = aoi === "WORLD";
  const rq = useQuery(fireRegimeQuery(aoi, ym, mv, !world));
  const fq = useQuery(frpMonthQuery(aoi, ym, mv, !world));
  const nf0 = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }), [lang]);
  const nf1 = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }), [lang]);

  const reg = rq.data;
  const row = reg?.months.find((r) => `${r.year}-${String(r.month).padStart(2, "0")}` === ym) ?? null;
  const fs = useMemo(() => frpSummary(fq.data?.cells), [fq.data]);
  const kv = (k: string, v: ReactNode) => (
    <div key={k}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );

  let regimeNode: ReactNode;
  if (world) regimeNode = <p className={cx("fm-na")}>{V("no_data_area")}</p>;
  else if (rq.isPending) regimeNode = <p className={cx("fm-na")}>…</p>;
  else if (rq.isError) regimeNode = <p className={cx("fm-na")}>{V(errKey(rq.error))}</p>;
  else if (!reg?.coverage.available) regimeNode = <p className={cx("fm-na")} data-coverage="none">{V("no_data_area")}</p>;
  else if (!row || !isRegime(row.fire_regime)) regimeNode = <p className={cx("fm-na")}>{V("no_month")}</p>;
  else {
    const rg = row.fire_regime;
    const pct = sharePct(row.share_large);
    regimeNode = (
      <>
        <div className={cx("fm-row")}>
          <span className={cx("fm-badge")} data-regime={rg}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              {SHAPE[rg]}
            </svg>
            {V(`regime.${rg}`)}
          </span>
          <span className={cx("fm-why")}>{V(`regime_why.${rg}`)}</span>
        </div>
        {rg !== "none" ? (
          <dl className={cx("fm-kv")}>
            {kv(V("k.events"), <b>{nf0.format(row.n_events ?? 0)}</b>)}
            {kv(V("k.large_events"), <b>{nf0.format(row.n_large_events ?? 0)}</b>)}
            {kv(V("k.share_large"), pct == null ? "–" : <b>{pct}%</b>)}
            {kv(V("k.top_event"), row.top_event_id ? <span className={cx("fm-off")}>{row.top_event_id}</span> : "–")}
          </dl>
        ) : null}
      </>
    );
  }

  let frpNode: ReactNode;
  if (world) frpNode = <p className={cx("fm-na")}>{V("err_wide")}</p>;
  else if (fq.isPending) frpNode = <p className={cx("fm-na")}>…</p>;
  else if (fq.isError) frpNode = <p className={cx("fm-na")}>{V(errKey(fq.error))}</p>;
  else if (fq.data && !fq.data.coverage.available) frpNode = <p className={cx("fm-na")} data-coverage="none">{V("no_data_area")}</p>;
  else if (!fs) frpNode = <p className={cx("fm-na")}>{V("frp_none")}</p>;
  else
    frpNode = (
      <dl className={cx("fm-kv")}>
        {kv(
          V("k.frp_sum"),
          <>
            <b>{nf0.format(fs.sum)}</b>
            <small>MW</small>
          </>,
        )}
        {kv(
          V("k.frp_max"),
          <>
            <b>{fs.max == null ? "–" : nf1.format(fs.max)}</b>
            <small>MW</small>
          </>,
        )}
        {kv(V("k.cells"), <b>{nf0.format(fs.cells)}</b>)}
        {kv(V("k.points"), <b>{nf0.format(fs.points)}</b>)}
      </dl>
    );

  return (
    <div className={cx("fm")} data-testid={testId} data-ready={world || (!rq.isPending && !fq.isPending) ? "1" : "0"} data-regime={row?.fire_regime ?? ""}>
      <div className={cx("fm-part")}>
        <span className={cx("fm-pk fm-pkr")}>
          {V("regime_title")}
          {!world && reg?.coverage.available ? (
            <CsvButton
              kind="fire-regime"
              aria={t("csv.regime", { a: aoi, p: ym })}
              make={async () => ({ name: `emberline_fire-regime_${aoi}_${ym}.csv`, text: await regimeCsv(aoi, ym, ym), meta: { aoi, aoi_name: reg?.name ?? null, period: ym, source: `/api/v1/aois/${aoi}/fire-regime` } })}
            />
          ) : null}
        </span>
        {regimeNode}
      </div>
      <div className={cx("fm-part")} data-frp="">
        <span className={cx("fm-pk fm-pkr")}>
          {V("frp_title")}
          {!world && fq.data?.coverage.available ? (
            <CsvButton
              kind="frp"
              aria={t("csv.frp", { a: aoi, p: ym })}
              make={async () => {
                const sp = monthSpan(ym);
                return { name: `emberline_frp_cells_${aoi}_${ym}.csv`, text: await frpCsv(aoi, ym), meta: { aoi, period: `${sp.start}/${sp.end}`, source: "/api/v1/cells/frp", freq: "month", cell_size_deg: 0.1, unit: "MW (S-NPP equiv)" } };
              }}
            />
          ) : null}
        </span>
        {frpNode}
        <p className={cx("fm-note")}>{V("frp_note")}</p>
      </div>
    </div>
  );
}
