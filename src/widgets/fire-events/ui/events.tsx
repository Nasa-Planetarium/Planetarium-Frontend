"use client";

import { useMemo, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { burnState, countOf, EVENTS_CSV_LIMIT, eventPlace, eventSpan, fireEventsCsv, monthEventsQuery, monthWindow, noCoverage, type FireEvent, type FireEventList } from "@/entities/fire-event";
import { ApiError } from "@/shared/api";
import { useT, type TFn } from "@/shared/i18n";
import { CsvButton } from "@/shared/ui";
import { cx } from "./cx";

/**
 * 화재 사건(위성) 표시 부품 — 상황판·피해 면적·캘린더·비교 분석이 같이 쓴다(F15).
 * 값은 release fire_events 그대로(A1): 감지 수 n_det · VIIRS 기준 감지량 sum_weight · 위성 확인 연소 면적(하한) burned_area_km2.
 * 「자료 없음」(coverage.available=false) 은 한 줄만 쓰고 0·가짜 값을 그리지 않는다. 「해당 없음」(빈 배열)과 가른다.
 */

export function useEvFmt() {
  const lang = useLocale();
  const t = useT();
  return useMemo(() => {
    const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
    const num = (n: number, d = 0) => nf(d).format(n);
    const km2 = (v: number) => num(v, v >= 10 ? 1 : 2);
    return { t, num, km2, lang };
  }, [t, lang]);
}
type Fmt = ReturnType<typeof useEvFmt>;

/** 위성 확인 연소 면적 표기(상태별 문구 — switch 대신 표) */
const BURN_TXT: Record<ReturnType<typeof burnState>, (e: FireEvent, f: Fmt) => string> = {
  na: (_e, f) => f.t("events.burn.na"),
  none: (_e, f) => f.t("events.burn.none"),
  km2: (e, f) => f.t("events.burn.km2", { v: f.km2(e.burned_area_km2 ?? 0) }),
};
export const burnText = (e: FireEvent, f: Fmt) => BURN_TXT[burnState(e)](e, f);

/** 쿼리 상태 → 화면 한 가지(대기 · 자료 없음 · 준비 중 · 오류 · 해당 없음 · 있음) */
export type EvState = "pending" | "na" | "not_loaded" | "error" | "empty" | "ok";
export function evState(q: Pick<UseQueryResult<FireEventList>, "data" | "error" | "isPending">): EvState {
  if (q.error) return q.error instanceof ApiError && q.error.code === "data_not_loaded" ? "not_loaded" : "error";
  if (q.isPending || !q.data) return "pending";
  if (noCoverage(q.data)) return "na";
  return q.data.events.length ? "ok" : "empty";
}
const STATE_KEY: Record<Exclude<EvState, "ok">, string> = {
  pending: "events.state.pending",
  na: "events.state.na",
  not_loaded: "events.state.not_loaded",
  error: "events.state.error",
  empty: "events.state.empty",
};
export const stateText = (s: Exclude<EvState, "ok">, t: TFn) => t(STATE_KEY[s]);

/** 사건 줄 목록 */
export function EventRows({ events, selId, onPick, place, testId }: { events: readonly FireEvent[]; selId?: string | null; onPick?: (e: FireEvent) => void; place?: (e: FireEvent) => string; testId?: string }) {
  const f = useEvFmt();
  return (
    <ul className={cx("fev-list")} data-testid={testId}>
      {events.map((e) => (
        <li key={e.event_id}>
          <button type="button" className={cx("fev-row")} data-ev={e.event_id} aria-pressed={selId === e.event_id} onClick={() => onPick?.(e)}>
            <i className={cx("fev-dot")} aria-hidden="true" />
            <span className={cx("fev-t")}>{(place ?? eventPlace)(e) || e.event_id}</span>
            <span className={cx("fev-d")}>{eventSpan(e)}</span>
            <span className={cx("fev-m")}>
              <span>
                {f.t("events.det")} <b>{f.num(e.n_det)}</b>
              </span>
              <span>
                {f.t("events.burn.short")} <b>{burnText(e, f)}</b>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 사건 하나 상세(피해 면적 화면 상세 칸·상황판 고른 사건) */
export function EventCard({ e, place, extra }: { e: FireEvent; place?: string; extra?: ReactNode }) {
  const f = useEvFmt();
  const st = burnState(e);
  return (
    <div className={cx("fev-card")} data-testid="fev-card" data-ev={e.event_id}>
      <div className={cx("fev-h")}>
        <span className={cx("fev-tag")}>{f.t("events.tag")}</span>
        <span className={cx("fev-n")}>{e.event_id}</span>
      </div>
      <h2>{place || eventPlace(e) || e.event_id}</h2>
      <div className={cx("fev-hero")}>
        <span className={cx("fev-hero-k")}>{f.t("events.burn.label")}</span>
        <p className={cx("fev-big")} data-burn={st}>
          {st === "km2" ? (
            <>
              <b>{f.km2(e.burned_area_km2 ?? 0)}</b>
              <span>km²</span>
            </>
          ) : (
            <span>{burnText(e, f)}</span>
          )}
        </p>
        <p className={cx("fev-note")}>{f.t("events.burn.note")}</p>
      </div>
      <dl className={cx("fev-dl")}>
        <dt>{f.t("events.k.period")}</dt>
        <dd>
          {eventSpan(e)} · {f.t("events.days", { n: e.duration_days })}
        </dd>
        <dt>{f.t("events.k.det")}</dt>
        <dd>
          {f.num(e.n_det)}
          {e.n_viirs != null || e.n_modis != null ? ` (VIIRS ${f.num(e.n_viirs ?? 0)} · MODIS ${f.num(e.n_modis ?? 0)})` : ""}
        </dd>
        <dt>{f.t("events.k.weight")}</dt>
        <dd>{f.num(e.sum_weight, e.sum_weight < 100 ? 1 : 0)}</dd>
        {e.frp_max != null ? (
          <>
            <dt>{f.t("events.k.frp")}</dt>
            <dd>{f.num(e.frp_max, 1)} MW</dd>
          </>
        ) : null}
        <dt>{f.t("events.k.center")}</dt>
        <dd>
          {e.centroid_lat.toFixed(3)}, {e.centroid_lon.toFixed(3)}
        </dd>
      </dl>
      {extra}
      <p className={cx("fev-note")}>{f.t("events.src")}</p>
    </div>
  );
}

/**
 * 고른 달의 사건 수(캘린더·비교 분석) — 「이 달 사건 N건 · 감지 3개 이상 M건」 + 큰 사건 3개.
 * 한국·아르헨티나 밖 AOI 는 「이 지역 자료 없음」 한 줄.
 */
export function MonthEvents({ aoiId, year, month, mv, testId = "month-events" }: { aoiId: string | null; year: number; month: number; mv: string | null; testId?: string }) {
  const f = useEvFmt();
  const all = useQuery(monthEventsQuery(aoiId, year, month, 1, mv, 1));
  const big = useQuery(monthEventsQuery(aoiId, year, month, 3, mv, 3));
  const st = evState(all);
  const n = all.data && st !== "na" ? countOf(all.data) : null;
  const m = big.data && evState(big) !== "na" ? countOf(big.data) : null;
  const nTxt = (c: { n: number; atLeast: boolean }) => f.t(c.atLeast ? "events.n_plus" : "events.n", { n: f.num(c.n) });
  return (
    <section className={cx("fev")} data-testid={testId} data-state={st} data-n={n?.n ?? ""} data-n3={m?.n ?? ""} aria-label={f.t("events.title")}>
      <div className={cx("fev-h")}>
        <h3>{f.t("events.title")}</h3>
        <span className={cx("fev-tag")}>{f.t("events.tag")}</span>
        {aoiId && (st === "ok" || st === "empty") ? <EventsCsv aoiId={aoiId} year={year} month={month} /> : null}
      </div>
      {st === "ok" || st === "empty" ? (
        <p className={cx("fev-line")}>
          {f.t("events.month.all")} <b>{n ? nTxt(n) : "–"}</b>
          {" · "}
          {f.t("events.month.big")} <b>{m ? nTxt(m) : "–"}</b>
        </p>
      ) : (
        <p className={cx("fev-na")}>{stateText(st, f.t)}</p>
      )}
      {big.data && big.data.events.length ? <EventRows events={big.data.events} /> : null}
    </section>
  );
}

/** 그 달 사건 CSV(서버 CSV 그대로 · 겹침 규칙 · 큰 사건 순 최대 1,000건) */
function EventsCsv({ aoiId, year, month }: { aoiId: string; year: number; month: number }) {
  const t = useT();
  const w = monthWindow(year, month);
  const p = `${w.start}/${w.end}`;
  return (
    <CsvButton
      kind="fire-events"
      aria={t("csv.events", { a: aoiId, p })}
      make={async () => ({
        name: `emberline_fire-events_${aoiId}_${w.start.slice(0, 7)}.csv`,
        text: await fireEventsCsv(aoiId, w.start, w.end),
        meta: { aoi: aoiId, period: p, source: "/api/v1/fire-events", rule: "overlap local dates", sort: "sum_weight", limit: EVENTS_CSV_LIMIT },
      })}
    />
  );
}
