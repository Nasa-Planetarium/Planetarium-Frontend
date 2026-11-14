"use client";

import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { clockTz, countryName, multiTz, type CountryInfo } from "@/entities/country";
import { detections, llShort, recentDetectionsQuery } from "@/entities/detection";
import { methodQuery } from "@/entities/release";
import { useNowMs } from "@/entities/situation";
import { useT } from "@/shared/i18n";
import { localHM } from "@/shared/lib";
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
/** 지도 칸 — 위젯끼리 import 하지 않게(FSD) 화면이 공통 지도를 그려 넘긴다 */
export type DetMap = (m: { view: Bbox | null; hotspots: DetHot[]; status: string | null }) => ReactNode;

type Cx = (...n: (string | false | null | undefined)[]) => string;

/**
 * 한국 밖 경보·출동(ops)·피해 면적(land) 화면 — 목업 core.js EM.ui.detPage + EM.counts(한국 밖) + EM.ui.detTable.
 * 경보·출동·피해 산정 원장은 경북 시나리오(목 · 사용자 결정)뿐이라 자원 칸 없이:
 * 머리(이름 + 나라 + 개수 띠) · 공통 지도(지난 24시간 감지 점 · 1급 경계 · 출처 폭 맞춤) · 「미확인 감지」 묶음 표.
 * 점은 실제 GET /hotspots(entities/detection) — 값을 지어내지 않는다. 받기 실패면 「–」 + 자료 준비 중, 점이 없으면 「지난 24시간 감지 없음」.
 * 화면 CSS 는 각 화면 모듈에 있어(.dp·.dt-tbl·.pghd) 클래스 이름 바꾸기(cx)를 화면이 넘긴다.
 */
export function DetBoard({ page, iso3, info, cx, testId, regions, renderMap }: { page: "ops" | "land"; iso3: string; info: CountryInfo | undefined; cx: Cx; testId: string; regions: { id: string; name: string; lat: number; lon: number }[] | undefined; renderMap: DetMap }) {
  const t = useT();
  const lang = useLocale();
  const nowMs = useNowMs();
  const mv = useQuery(methodQuery()).data?.method_version ?? null;
  const bb = ((info as (CountryInfo & { bbox_main?: Bbox }) | undefined)?.bbox_main ?? info?.bbox ?? null) as Bbox | null;
  const centers = useMemo(() => (regions ?? []).map((r) => [r.lat, r.lon] as const), [regions]);
  const q = useQuery({ ...recentDetectionsQuery(iso3, bb, nowMs, mv, centers), enabled: !!mv && nowMs != null && !!bb && !!regions });
  const regs = regions;
  const D = useMemo(() => (q.data && nowMs != null ? detections(q.data.points, nowMs) : null), [q.data, nowMs]);
  const partial = q.data && q.data.done < q.data.total ? t("shell.det.partial", { n: q.data.done, m: q.data.total }) : null;
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
          {renderMap({ view: bb, hotspots: hot, status: fail ? t("shell.err.data_not_loaded") : partial })}
        </section>
        <section className={cx("panel dp-list")} aria-label={t("shell.det.title")}>
          <div className={cx("sechd")}>
            <h2>{t("shell.det.title")}</h2>
            <span className={cx("sh-n")}>{D ? fmt(D.clusters.length) : "–"}</span>
          </div>
          {!D ? (
            <p className={cx("dt-none")} role="status">
              {fail ? t("shell.err.data_not_loaded") : "…"}
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
