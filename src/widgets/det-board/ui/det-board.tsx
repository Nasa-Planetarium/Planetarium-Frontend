"use client";

import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { clockTz, countryName, multiTz, type CountryInfo } from "@/entities/country";
import { detections, llShort, recentDetectionsQuery } from "@/entities/detection";
import { methodQuery } from "@/entities/release";
import { useCoarseSum } from "@/entities/world-grid";
import { ApiError } from "@/shared/api";
import { useNowMs } from "@/entities/situation";
import { useT } from "@/shared/i18n";
import { aoiOfIso3, localHM } from "@/shared/lib";
type Bbox = [number, number, number, number];
/** 지도에 넘길 점(공통 지도 MapHotspot 과 같은 모양) */
export interface DetHot {
  lat: number;
  lon: number;
  sensor: string;
  frp: number | null;
  conf: string;
  time: string;
}
/** 월 감지량 칸(공통 지도 MapCell 과 같은 모양) */
export interface DetCell {
  lat: number;
  lon: number;
  size: number;
  value: number;
}
/** 지도 칸 — 위젯끼리 import 하지 않게(FSD) 화면이 공통 지도를 그려 넘긴다. cells = 이번 달(없으면 지난달) 1° 칸 감지량(바탕) */
export type DetMap = (m: { view: Bbox | null; hotspots: DetHot[]; cells: DetCell[]; cellsLabel: string; status: string | null }) => ReactNode;

type Cx = (...n: (string | false | null | undefined)[]) => string;

/**
 * 한국 밖 경보·출동(ops)·피해 면적(land) 화면 — 목업 core.js EM.ui.detPage + EM.counts(한국 밖) + EM.ui.detTable.
 * 경보·출동·피해 산정 원장은 경북 시나리오(목 · 사용자 결정)뿐이라 자원 칸 없이:
 * 머리(이름 + 나라 + 개수 띠) · 공통 지도(지난 24시간 감지 점 + 바탕 이번 달 1° 칸 감지량 · 1급 경계 · 출처 폭 맞춤) · 「미확인 감지」 묶음 표.
 * 점은 실제 GET /hotspots(entities/detection) — 값을 지어내지 않는다. 받기 실패면 「–」 + 그 까닭(429 = 서버 요청 한도 · 503 = 자료 준비 중 · 그 밖 = 요청 실패), 점이 없으면 「지난 24시간 감지 없음」.
 * 화면 CSS 는 각 화면 모듈에 있어(.dp·.dt-tbl·.pghd) 클래스 이름 바꾸기(cx)를 화면이 넘긴다.
 */
export function DetBoard({ page, iso3, info, cx, testId, regions, renderMap }: { page: "ops" | "land"; iso3: string; info: CountryInfo | undefined; cx: Cx; testId: string; regions: { id: string; name: string; lat: number; lon: number }[] | undefined; renderMap: DetMap }) {
  const t = useT();
  const lang = useLocale();
  const nowMs = useNowMs();
  const mv = useQuery(methodQuery()).data?.method_version ?? null;
  const bb = ((info as (CountryInfo & { bbox_main?: Bbox }) | undefined)?.bbox_main ?? info?.bbox ?? null) as Bbox | null;
  const centers = useMemo(() => (regions ?? []).map((r) => [r.lat, r.lon] as const), [regions]);
  /* 바탕: 나라 전체 이번 달 1° 칸 감지량(정적 world-1deg — 실서버 heavy 한도와 무관). 그 달이 자료에 없으면 지난달 */
  const ym = useMemo(() => {
    if (nowMs == null) return null;
    const d = new Date(nowMs);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return { cur: [[y, m] as const], prev: [[m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1] as const] };
  }, [nowMs]);
  const aoiId = aoiOfIso3(iso3);
  const coCur = useCoarseSum({ aoiId, aois: null, months: ym?.cur ?? [], on: !!ym });
  const coPrev = useCoarseSum({ aoiId, aois: null, months: ym?.prev ?? [], on: !!ym && coCur.data?.months === 0 });
  const co = coCur.data?.months ? coCur.data : coPrev.data;
  const coYm = ym ? (coCur.data?.months ? ym.cur[0] : ym.prev[0]) : null;
  const cellsLabel = coYm ? t("shell.map.cells_month", { m: `${coYm[0]}.${String(coYm[1]).padStart(2, "0")}` }) : "";
  const cells = useMemo(() => co?.cells ?? [], [co]);
  /* 조각 무게 = 그 조각에 든 1° 칸 감지량 합 → 불이 잦은 땅부터 받는다(한도에 걸려 멈춰도) */
  const weight = useMemo(() => {
    if (!co?.cells.length) return null;
    const cs = co.cells;
    return {
      key: `w${cs.length}`,
      of: (b: readonly [number, number, number, number]) => cs.reduce((t, c) => (c.lat >= b[1] && c.lat < b[3] && c.lon >= b[0] && c.lon < b[2] ? t + c.value : t), 0),
    };
  }, [co]);
  const coSettled = !ym || !!co || coCur.isError || coPrev.isError;
  const q = useQuery({ ...recentDetectionsQuery(iso3, bb, nowMs, mv, centers, weight), enabled: !!mv && nowMs != null && !!bb && !!regions && coSettled });
  const regs = regions;
  /* 조각은 나라 상자(bbox_main)를 덮어 이웃 나라 점도 온다(일본 상자에 든 중국 동북·러시아 연해주) → 그 나라 점만(adm1_code 「ISO3-…」 · adm0_a3). 나라 표시가 없는 점은 둔다 */
  const D = useMemo(() => {
    if (!q.data || nowMs == null) return null;
    const own = q.data.points.filter((h) => {
      const r = h as { adm1_code?: string | null; adm0_a3?: string | null };
      const c = r.adm0_a3 ?? (r.adm1_code ? r.adm1_code.split("-")[0] : null);
      return !c || c === iso3;
    });
    return detections(own, nowMs);
  }, [q.data, nowMs, iso3]);
  const partial = q.data && q.data.done < q.data.total ? t("shell.det.partial", { n: q.data.done, m: q.data.total }) : null;
  const rateErr = q.error instanceof ApiError && q.error.status === 429;
  const failWord = rateErr ? t("shell.err.rate_limited") : q.error instanceof ApiError && q.error.code === "data_not_loaded" ? t("shell.err.data_not_loaded") : t("shell.err.request");
  const regName = useMemo(() => {
    const m = new Map((regs ?? []).map((r) => [r.id, r.name]));
    return (id: string) => m.get(id) ?? (id === iso3 ? countryName(info, lang, iso3) : id);
  }, [regs, iso3, info, lang]);
  const tz = nowMs != null ? clockTz(info, { utc: false, regionChosen: false, nowMs }) : "UTC";
  const hot: DetHot[] = useMemo(
    () => (D ? D.points.map((h) => ({ lat: h.latitude, lon: h.longitude, sensor: h.instrument, frp: h.frp, conf: h.confidence, time: `${localHM(Date.parse(h.acq_datetime_utc), tz)}` })) : []),
    [D, tz],
  );
  const fmt = (v: number, d = 0) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const fail = q.isError;
  const v = (n: number | null | undefined) => (D && n != null ? fmt(n) : "–");
  const top = D ? D.clusters.reduce((m, c) => Math.max(m, c.level), 0) : 0;
  const T = (k: string) => t(`shell.det.${k}`);
  const counts: { key: string; label: string; short?: string; value: string; lv?: number; unit?: string }[] =
    page === "land"
      ? [
          { key: "det", label: T("clusters"), short: T("clusters.short"), value: v(D?.clusters.length), lv: top },
          { key: "area", label: T("area"), value: D ? fmt(Math.round(D.clusters.reduce((s, c) => s + c.area_km2, 0) * 100)) : "–", unit: "ha" },
        ]
      : [
          { key: "det", label: T("clusters"), short: T("clusters.short"), value: v(D?.clusters.length), lv: top },
          { key: "pts", label: T("points"), short: T("points.short"), value: v(D?.n) },
          { key: "high", label: T("high"), short: T("high.short"), value: v(D?.high) },
          { key: "reg", label: T("regions"), value: v(D?.regions) },
        ];
  const rows = D ? D.clusters.slice(0, 60) : [];
  const rc: Record<string, number> = {};
  rows.forEach((c) => (rc[c.region] = (rc[c.region] ?? 0) + 1));
  const C = (k: string) => t(`shell.det.col.${k}`);
  const area = page === "land";
  return (
    <div className={cx("dp", page === "ops" && "op-out")} data-testid={testId} data-tz={multiTz(info, nowMs ?? 0) ? "multi" : "one"}>
      <header className={cx("pghd")}>
        <div className={cx("ph-1")}>
          <h1>{t(`${page}.head.name`)}</h1>
          <span className={cx("ph-scope")}>{countryName(info, lang, iso3)}</span>
        </div>
        <div className={cx("cntbar")} role="group" aria-label={t("shell.counts.aria")}>
          {counts.map((c) => (
            <button key={c.key} type="button" className={cx("cb")} aria-pressed="false" data-cnt={c.key}>
              <span className={cx("cb-k")}>
                {c.short ? (
                  <>
                    <span className={cx("cb-l")}>{c.label}</span>
                    <span className={cx("cb-s")}>{c.short}</span>
                  </>
                ) : (
                  c.label
                )}
              </span>
              <span className={cx("cb-vw")}>
                {c.lv ? <i className={cx("cb-dot")} style={{ ["--c" as string]: `var(--alert-${c.lv})` }} aria-hidden="true" /> : null}
                <b className={cx("cb-v")}>{c.value}</b>
                {c.unit ? <span className={cx("cb-u")}>{c.unit}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </header>
      <div className={cx("dp-g")}>
        <section className={cx("dp-map")} aria-label={t("shell.det.title")}>
          {renderMap({ view: bb, hotspots: hot, cells, cellsLabel, status: fail ? failWord : partial })}
        </section>
        <section className={cx("panel dp-list")} aria-label={t("shell.det.title")}>
          <div className={cx("sechd")}>
            <h2>{t("shell.det.title")}</h2>
            <span className={cx("sh-n")}>{D ? fmt(D.clusters.length) : "–"}</span>
          </div>
          {!D ? (
            <p className={cx("dt-none")} role="status">
              {fail ? failWord : "…"}
            </p>
          ) : !rows.length ? (
            <p className={cx("dt-none")} role="status">
              {T("none")}
            </p>
          ) : (
            <div className={cx("tbl-wrap dt-wrap")}>
              <table className={cx("tbl is-row dt-tbl")} data-testid={`${testId}-table`}>
                <thead>
                  <tr>
                    <th>{C("place")}</th>
                    <th className={cx("r")}>{C("n")}</th>
                    <th className={cx("r dt-o")}>{C("sensors")}</th>
                    <th className={cx("r")}>{C("frp")}</th>
                    {area ? <th className={cx("r")}>{C("area")}</th> : <th className={cx("r dt-o")}>{C("high")}</th>}
                    <th className={cx("r")}>{C("last")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className={cx("dt-pl")}>
                          <i className={cx("dt-dot")} style={{ ["--c" as string]: `var(--alert-${c.level})` }} aria-hidden="true" />
                          {regName(c.region)}
                        </span>
                        {(rc[c.region] ?? 0) > 1 ? <small className={cx("dt-ll num")}>{llShort(c.lat, c.lon)}</small> : null}
                      </td>
                      <td className={cx("r num")}>{fmt(c.n)}</td>
                      <td className={cx("r num dt-o")}>
                        {fmt(c.viirs)} / {fmt(c.modis)}
                      </td>
                      <td className={cx("r num")}>{fmt(c.frp_max, 1)}</td>
                      {area ? <td className={cx("r num")}>{fmt(Math.round(c.area_km2 * 100))}</td> : <td className={cx("r num dt-o")}>{fmt(c.high)}</td>}
                      <td className={cx("r num")}>{localHM(c.last_ms, tz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
