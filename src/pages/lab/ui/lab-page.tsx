"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { countryName, useCountry, type CountryInfo } from "@/entities/country";
import { useSession } from "@/entities/session";
import { ScopeButton, aoiOfIso3, useAoiScope, type Bbox } from "@/features/pick-aoi";
import { api, unwrap } from "@/shared/api";
import { PAGES } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { PageFrame } from "@/widgets/page-frame";
import { aoiOccurrenceListQuery, aoiOccurrenceQuery, gridOccurrenceQuery, type AoiOccurrence, type GridCell } from "../api/occurrence";
import { BAND_KEYS, bandOf, geomBounds, latLon, pct, ppDiff, shadeOf, sortOcc } from "../model/occ";
import { LabBand } from "./lab-band";
import { LabMap } from "./lab-map";
import { cx } from "./cx";
import { downloadText, toCSV } from "./use-lab";

/**
 * 예측 분석(lab, 과학자) — 모델팀 「다음 달 발생 확률」(결정 F15, release data-v1.2-2026-11-15).
 * 자료: /api/v1 /occurrence/grid(전 세계 0.5° 격자) · /occurrence/aois(한국 시군구 252) · /aois/{id}/occurrence(고른 지역 — 시군구는 모델 값, 그 밖은 격자 요약).
 * 화면은 확률을 다시 계산하지 않는다(A1). 지역 확률은 시군구만 있다 — 나라·시도는 칸 분포(격자 요약)로만 말한다(계약 Q2).
 * 한국: 고른 범위(?aoi=, 기본 대한민국)의 시군구 면 · 그 밖: 0.5° 칸 색. 지속·산업 열원 의심은 회색, 순위·강조에서 뺀다.
 */
export function LabPage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <LabGate />
    </Suspense>
  );
}

function LabGate() {
  useCountry();
  const { data: session, isPending } = useSession();
  const ok = !isPending && !!session && (PAGES.lab.roles ?? []).includes(session.role);
  if (!ok) return <PageFrame page="lab" />;
  return <LabScreen />;
}

export type TV = (k: string, p?: Record<string, string | number>) => string;
/** 표·지도가 함께 쓰는 행(시군구 하나 또는 0.5° 칸 하나) */
export interface OccRow {
  id: string;
  name: string;
  p_any: number | null;
  baseline_p: number | null;
  vs_normal: string | null;
  suspected_industrial: boolean | null;
  rank: number | null;
  /** 시군구 면(경계 받기 전 null) */
  geom?: unknown;
  cell?: GridCell;
  item?: AoiOccurrence;
}
type Filter = "ge70" | "higher" | null;

function LabScreen() {
  const t = useT();
  const lang = useLocale();
  const { iso3, info } = useCountry();
  const kor = iso3 === "KOR";
  const S = useAoiScope();
  const scopeId = kor ? S.scope : aoiOfIso3(iso3);
  const cname = countryName(info, lang, iso3);
  const areaName = kor ? S.nameOf(scopeId) : cname;

  const grid = useQuery({ ...gridOccurrenceQuery(), enabled: !kor });
  const list = useQuery({ ...aoiOccurrenceListQuery(scopeId), enabled: kor && !!scopeId });
  const sum = useQuery({ ...aoiOccurrenceQuery(scopeId), enabled: !!scopeId });

  /* 한국: 시군구 행 + 면(/aois/{id}/boundary — 못 받으면 면 없이 표만) */
  const items = useMemo(() => (kor ? (list.data?.items ?? []) : []), [kor, list.data]);
  const geoms = useQueries({
    queries: items.map((a) => ({
      queryKey: ["lab", "boundary", a.aoi_id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => api.GET("/aois/{aoiId}/boundary", { params: { path: { aoiId: a.aoi_id } }, signal }).then(unwrap) as Promise<unknown>,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const geomKey = geoms.map((g) => (g.data ? 1 : 0)).join("");
  const sggRows: OccRow[] = useMemo(
    () =>
      items.map((a, i) => {
        const g = geoms[i]?.data as { geometry?: unknown } | undefined;
        return { id: a.aoi_id, name: S.byId.has(a.aoi_id) ? S.nameOf(a.aoi_id) : (a.name_ko ?? a.aoi_id), p_any: a.p_any, baseline_p: a.baseline_p, vs_normal: a.vs_normal ?? null, suspected_industrial: a.suspected_industrial, rank: a.rank ?? null, geom: g?.geometry ?? null, item: a };
      }),
    // geoms 는 쿼리마다 새 배열이라 받은 여부(geomKey)로만 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, S.byId, S.nameOf, geomKey],
  );
  /* 다른 나라: 고른 나라 격자 요약의 상위 칸(지속 열원 제외, 최대 10) */
  const gs = sum.data?.grid_summary ?? null;
  const cellRows: OccRow[] = useMemo(
    () => (kor ? [] : (gs?.top_cells ?? []).map((c) => ({ id: String(c.cell_id), name: latLon(c.lat, c.lon), p_any: c.p_any, baseline_p: c.baseline_p, vs_normal: c.vs_normal, suspected_industrial: false, rank: null, cell: c }))),
    [kor, gs],
  );
  const rows = kor ? sggRows : cellRows;

  /* 고른 것: 한국 = 시군구 id(범위를 바꾸면 비움, ?aoi=SGG_… 로 들어오면 그 행) · 다른 나라 = 칸 id */
  const [sel, setSel] = useState<{ iso: string; scope: string; id: string | null } | null>(null);
  const selId = sel && sel.iso === iso3 && sel.scope === scopeId ? sel.id : kor ? S.focus : null;
  const select = (id: string | null) => setSel({ iso: iso3, scope: scopeId, id });
  const cellIx = useMemo(() => new Map((grid.data?.cells ?? []).map((c) => [String(c.cell_id), c] as const)), [grid.data]);
  const selRow: OccRow | null = selId ? (rows.find((r) => r.id === selId) ?? (() => {
    const c = cellIx.get(selId);
    return c ? { id: selId, name: latLon(c.lat, c.lon), p_any: c.p_any, baseline_p: c.baseline_p, vs_normal: c.vs_normal, suspected_industrial: c.persistent_source, rank: null, cell: c } : null;
  })()) : null;

  const [flt, setFlt] = useState<Filter>(null);
  const [sort, setSort] = useState<{ k: "name" | "p" | "b" | "d"; dir: number }>({ k: "p", dir: -1 });
  /* 표 아래 「N개 중 M개 보임, 표를 내려 더 보기」(목업 lab.js tblMore) — 행이 다 보이면 숨김 */
  const sideRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<{ n: number; seen: number } | null>(null);
  useEffect(() => {
    const side = sideRef.current;
    const wrap = wrapRef.current;
    if (!side || !wrap) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const trs = Array.from(wrap.querySelectorAll("tbody tr"));
      const head = wrap.querySelector("thead");
      if (!trs.length || !head) return setMore(null);
      const lim = Math.min(side.getBoundingClientRect().bottom, wrap.getBoundingClientRect().bottom);
      const top = head.getBoundingClientRect().bottom;
      const seen = trs.filter((tr) => {
        const b = tr.getBoundingClientRect();
        return b.bottom <= lim + 1 && b.top >= top - 1;
      }).length;
      setMore((p) => (seen >= trs.length ? null : p && p.n === trs.length && p.seen === seen ? p : { n: trs.length, seen }));
    };
    const later = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    side.addEventListener("scroll", later, { passive: true });
    wrap.addEventListener("scroll", later, { passive: true });
    const ro = new ResizeObserver(later);
    ro.observe(side);
    ro.observe(wrap);
    const tb = wrap.querySelector("table");
    if (tb) ro.observe(tb);
    later();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      side.removeEventListener("scroll", later);
      wrap.removeEventListener("scroll", later);
      ro.disconnect();
    };
  }, [rows, flt, sort, list.data, grid.data, sum.data]);

  const ready = kor ? !!list.data && !!sum.data : !!grid.data && !!sum.data;
  const failed = (kor ? list.isError : grid.isError) || sum.isError;
  const tm = (kor ? list.data?.target_month : grid.data?.target_month) ?? sum.data?.target_month ?? null;
  const asOf = (kor ? list.data?.as_of_date : grid.data?.as_of_date) ?? sum.data?.as_of_date ?? null;
  const ym = (s: string | null | undefined) => (!s ? "–" : lang === "ko" ? `${s.slice(0, 4)}.${s.slice(5, 7)}` : new Intl.DateTimeFormat(lang, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${s}-01T00:00:00Z`)));
  const nf = useMemo(() => new Intl.NumberFormat(lang), [lang]);
  const VSW: Record<string, string> = { higher: t("occ.vs.higher"), similar: t("occ.vs.similar"), lower: t("occ.vs.lower") };

  /* ── 머리: 화면 이름 · 범위 · 개수 띠 ── */
  const ok = rows.filter((r) => !r.suspected_industrial);
  const nGe70 = kor ? ok.filter((r) => bandOf(r.p_any) === 3).length : (gs?.bands.ge70 ?? 0);
  const nHigher = ok.filter((r) => r.vs_normal === "higher").length;
  const head = () => {
    const C: { key: string; label: string; value: string; unit: string; f?: Filter }[] = kor
      ? [
          { key: "tot", label: t("occ.head.sgg"), value: nf.format(rows.length), unit: t("occ.u.places"), f: null },
          { key: "ge70", label: t("occ.head.ge70"), value: nf.format(nGe70), unit: t("occ.u.places"), f: "ge70" },
          { key: "higher", label: t("occ.head.higher"), value: nf.format(nHigher), unit: t("occ.u.places"), f: "higher" },
        ]
      : [
          { key: "tot", label: t("occ.head.cells"), value: gs ? nf.format(gs.n_cells) : "–", unit: t("occ.u.cells") },
          { key: "ge70", label: t("occ.head.ge70_cells"), value: gs ? nf.format(nGe70) : "–", unit: t("occ.u.cells") },
          { key: "ps", label: t("occ.head.persistent"), value: gs ? nf.format(gs.n_persistent) : "–", unit: t("occ.u.cells") },
        ];
    return (
      <header className={cx("pghd")}>
        <div className={cx("ph-1")}>
          <h1>{t("lab.ui.forecast2")}</h1>
          <span className={cx("ph-scope")} data-scope="">
            {t("occ.scope", { a: areaName, m: ym(tm), d: asOf ?? "–" })}
          </span>
          {kor ? (
            <div className={cx("ph-tools")}>
              <ScopeButton s={S} size="sm" />
            </div>
          ) : null}
        </div>
        <div className={cx("cntbar")} role="group" aria-label={t("shell.counts.aria")}>
          {C.map((c) =>
            kor ? (
              <button key={c.key} type="button" className={cx("cb")} data-cnt={c.key} aria-pressed={flt === c.f && (c.f !== null || !selId)} onClick={() => (c.f === null ? (setFlt(null), select(null)) : setFlt((v) => (v === c.f ? null : (c.f ?? null))))}>
                <span className={cx("cb-k")}>{c.label}</span>
                <span className={cx("cb-vw")}>
                  <b className={cx("cb-v")}>{c.value}</b>
                  <span className={cx("cb-u")}>{c.unit}</span>
                </span>
              </button>
            ) : (
              <div key={c.key} className={cx("cb oc-cbs")} data-cnt={c.key}>
                <span className={cx("cb-k")}>{c.label}</span>
                <span className={cx("cb-vw")}>
                  <b className={cx("cb-v")}>{c.value}</b>
                  <span className={cx("cb-u")}>{c.unit}</span>
                </span>
              </div>
            ),
          )}
        </div>
      </header>
    );
  };

  /* ── 고른 지역 요약 ── */
  const noData = <p className={cx("oc-nodata")} data-nodata="">{t("occ.no_data")}</p>;
  const summary = () => {
    if (failed) return <p className={cx("oc-nodata")}>{t("occ.load_failed")}</p>;
    if (selRow) {
      const grey = !!selRow.suspected_industrial;
      const it = selRow.item;
      return (
        <div className={cx("oc-sum")} data-sum="sel">
          <div className={cx("oc-sumh")}>
            <span className={cx("oc-sumk")}>{selRow.cell ? t("occ.sum.cell") : selRow.name}</span>
            <button type="button" className={cx("btn sm ghost")} data-x="clear" onClick={() => select(null)}>
              {t("occ.sum.back", { a: areaName })}
            </button>
          </div>
          {selRow.cell ? <span className={cx("oc-sub num")}>{selRow.name}</span> : null}
          <div className={cx("oc-big", grey && "is-grey")}>
            <b className={cx("num")} data-p="">
              {pct(selRow.p_any)}
            </b>
            <span>{t("occ.sum.p_label", { m: ym(tm) })}</span>
          </div>
          <dl className={cx("sumlist")}>
            <dt>{t("occ.col.base")}</dt>
            <dd className={cx("num")}>{pct(selRow.baseline_p)}</dd>
            <dt>{t("occ.col.diff")}</dt>
            <dd>
              <span className={cx("num")}>{ppDiff(selRow.p_any, selRow.baseline_p)}</span> · <span className={cx("oc-vs", "oc-vs-" + (grey ? "grey" : (selRow.vs_normal ?? "na")))}>{selRow.vs_normal ? VSW[selRow.vs_normal] : "–"}</span>
            </dd>
            {it?.rate_5y != null ? (
              <>
                <dt>{t("occ.sum.rate5y")}</dt>
                <dd className={cx("num")}>{pct(it.rate_5y)}</dd>
              </>
            ) : null}
            {it?.n_years != null ? (
              <>
                <dt>{t("occ.sum.years")}</dt>
                <dd className={cx("num")}>{t("occ.sum.years_v", { n: it.n_years })}</dd>
              </>
            ) : null}
            {selRow.rank != null ? (
              <>
                <dt>{t("occ.sum.rank")}</dt>
                <dd className={cx("num")}>{t("occ.sum.rank_v", { r: selRow.rank, n: ok.length })}</dd>
              </>
            ) : null}
          </dl>
          {grey ? <p className={cx("oc-grey")} data-grey="">{selRow.cell ? t("occ.sum.persistent") : t("occ.sum.industrial")}</p> : null}
          {it?.lag1_projected ? <p className={cx("lb-cap")}>{t("occ.sum.lag1")}</p> : null}
        </div>
      );
    }
    const d = sum.data;
    if (!d) return <p className={cx("lb-empty")}>{t("occ.loading")}</p>;
    if (!d.coverage.available) return noData;
    if (d.unit === "aoi") return null;
    const g = d.grid_summary;
    if (!g) return noData;
    const ncl = g.n_cells - g.n_persistent;
    return (
      <div className={cx("oc-sum")} data-sum="area">
        <div className={cx("oc-sumh")}>
          <span className={cx("oc-sumk")}>{t("occ.sum.area", { a: areaName })}</span>
        </div>
        <div className={cx("oc-big")}>
          <b className={cx("num")}>{pct(g.p_any_max)}</b>
          <span>{t("occ.sum.max")}</span>
        </div>
        <div className={cx("oc-bars")} role="img" aria-label={BAND_KEYS.map((k, i) => `${t("occ.band." + i)} ${g.bands[k] ?? 0}`).join(", ")}>
          {BAND_KEYS.map((k, i) => {
            const n = g.bands[k] ?? 0;
            return n > 0 ? <i key={k} className={cx("oc-bar", "oc-b" + i)} style={{ flexGrow: n }} title={`${t("occ.band." + i)} ${n}`} /> : null;
          })}
        </div>
        <p className={cx("oc-barkey")}>
          {BAND_KEYS.map((k, i) => (
            <span key={k}>
              <i className={cx("oc-sw", "oc-b" + i)} />
              {t("occ.band." + i)} <b className={cx("num")}>{nf.format(g.bands[k] ?? 0)}</b>
            </span>
          ))}
        </p>
        <dl className={cx("sumlist")}>
          <dt>{t("occ.sum.median")}</dt>
          <dd className={cx("num")}>{pct(g.p_any_median)}</dd>
          <dt>{t("occ.sum.ncells")}</dt>
          <dd className={cx("num")}>{t("occ.sum.ncells_v", { n: nf.format(ncl), p: nf.format(g.n_persistent) })}</dd>
        </dl>
        <p className={cx("lb-cap")}>{t("occ.sum.not_area_p")}</p>
      </div>
    );
  };

  /* ── 표 ── */
  const shown = sortOcc(
    rows.filter((r) => !flt || (!r.suspected_industrial && (flt === "ge70" ? bandOf(r.p_any) === 3 : r.vs_normal === "higher"))),
    sort.k,
    sort.dir,
    lang,
  );
  const COLS = [
    { k: "name" as const, t: kor ? t("occ.col.sgg") : t("occ.col.cell") },
    { k: "p" as const, t: t("occ.col.p"), r: true },
    { k: "b" as const, t: t("occ.col.base"), r: true },
    { k: "d" as const, t: t("occ.col.vs") },
  ];
  const table = () => {
    if (failed) return null;
    if (kor && list.data && !list.data.coverage.available) return noData;
    /* 위 요약이 이미 「이 지역 자료 없음」 한 줄을 말한다 — 표는 되풀이하지 않는다 */
    if (!kor && sum.data && !sum.data.coverage.available) return null;
    if (!rows.length) return ready ? noData : null;
    return (
      <table className={cx("tbl is-row lb-ft oc-ft")} data-ft="">
        <caption className={cx("lb-sr")}>{t("occ.table_cap")}</caption>
        <thead>
          <tr>
            {COLS.map((c) => {
              const on = sort.k === c.k;
              return (
                <th key={c.k} className={cx(c.r && "r") || undefined} aria-sort={on ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
                  <button type="button" className={cx("lb-sort", on && "on")} data-k={c.k} onClick={() => setSort((s) => (s.k === c.k ? { k: c.k, dir: -s.dir } : { k: c.k, dir: c.k === "name" ? 1 : -1 }))}>
                    {c.t}
                    {on ? (
                      <span className={cx("lb-sa")} aria-hidden="true">
                        {sort.dir > 0 ? "▲" : "▼"}
                      </span>
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const on = selId === r.id;
            const sh = shadeOf(r.p_any, r.suspected_industrial);
            return (
              <tr key={r.id} className={cx(on && "on", r.suspected_industrial && "oc-greyrow") || undefined} data-r={r.id} data-grey={r.suspected_industrial ? "1" : undefined} onClick={() => select(on ? null : r.id)}>
                <td>
                  <button type="button" className={cx("lb-rbtn")} data-r={r.id} aria-pressed={on}>
                    <i className={cx("oc-sw", sh == null ? "oc-bna" : "oc-b" + sh)} aria-hidden="true" />
                    {r.name}
                  </button>
                </td>
                <td className={cx("num r lb-c-med")}>{pct(r.p_any)}</td>
                <td className={cx("num r lb-c-p50")}>{pct(r.baseline_p)}</td>
                <td>{r.suspected_industrial ? <span className={cx("oc-vs oc-vs-grey")}>{t("occ.industrial_short")}</span> : <span className={cx("oc-vs", "oc-vs-" + (r.vs_normal ?? "na"))}>{r.vs_normal ? VSW[r.vs_normal] : "–"}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const csv = () => {
    if (!rows.length) return;
    downloadText(
      `emberline_occurrence_${tm ?? "next"}_${scopeId}.csv`,
      toCSV(shown, [
        { label: kor ? "aoi_id" : "cell_id", get: (r) => r.id },
        { label: "name", get: (r) => r.name },
        { label: "target_month", get: () => tm ?? "" },
        { label: "as_of_date", get: () => asOf ?? "" },
        { label: "p_any", get: (r) => r.p_any },
        { label: "baseline_p", get: (r) => r.baseline_p },
        { label: "vs_normal", get: (r) => r.vs_normal },
        { label: kor ? "suspected_industrial" : "persistent_source", get: (r) => (r.suspected_industrial ? "true" : "false") },
        { label: "rank", get: (r) => r.rank },
        { label: "model", get: (r) => (kor ? (r.item?.model ?? "") : (sum.data?.model ?? "")) },
        { label: "data_release", get: () => (kor ? list.data?.data_release : sum.data?.data_release) ?? "" },
      ]),
    );
  };

  /* 지도 맞춤: 한국 = 고른 범위의 시군구 면 상자 · 그 밖 = 나라 본토 상자 */
  const geomBox = useMemo(() => (kor ? geomBounds(sggRows.map((r) => r.geom).filter(Boolean)) : null), [kor, sggRows]);
  const fit: Bbox | null = useMemo(() => {
    if (kor) return (S.byId.get(scopeId)?.bbox as Bbox | undefined) ?? geomBox;
    const inf = info as (CountryInfo & { bbox_main?: Bbox }) | undefined;
    return inf?.bbox_main ?? inf?.bbox ?? null;
  }, [kor, S.byId, scopeId, geomBox, info]);

  const continent = (S.byId.get(scopeId)?.parent_id ?? "").replace(/^CONT_/, "").replace(/_/g, " ") || null;
  const ctx = { t, kor, iso3, lang, rows, sel: selId, select, selRow, cells: grid.data?.cells ?? null, fit, ready, VSW, areaName, tm: ym(tm), asOf, continent, failed };

  return (
    <div className="min-h-0 min-w-0" data-page="lab">
      <div className={cx("lb")} data-testid="lab" data-ready={ready ? "1" : "0"}>
        <div className={cx("lb-screen")}>
          <div className={cx("lb-head")}>{head()}</div>
          <section className={cx("lb-stage")} aria-label={t("occ.map_aria")}>
            <LabMap {...ctx} />
          </section>
          <aside className={cx("lb-side")} aria-label={t("occ.side_aria")} ref={sideRef}>
            <section className={cx("panel lb-tot")}>{summary()}</section>
            <section className={cx("panel lb-tblp")}>
              <div className={cx("listhead")}>
                <h3 className={cx("lh-t")}>{kor ? t("occ.list_sgg") : t("occ.list_cells")}</h3>
                <span className={cx("lh-n")}>
                  <b>{nf.format(shown.length)}</b>
                  {kor ? t("occ.u.places") : t("occ.u.cells")}
                </span>
                <span className={cx("lh-a")}>
                  <button type="button" className={cx("btn sm ghost")} data-x="reg" aria-label={t("occ.csv_aria")} onClick={csv} disabled={!rows.length}>
                    {t("occ.csv")}
                  </button>
                </span>
              </div>
              <div className={cx("lb-tblwrap")} ref={wrapRef}>
                {table()}
              </div>
              {more ? (
                <div className={cx("lb-more")} data-more="">
                  <span>{t("occ.more", { n: more.n, m: more.seen })}</span>
                </div>
              ) : null}
              {!kor && rows.length ? <p className={cx("lb-cap lb-tcap")}>{t("occ.top_cells_cap")}</p> : null}
            </section>
          </aside>
        </div>
        <LabBand {...ctx} />
      </div>
    </div>
  );
}
export type LabCtx = {
  t: TV;
  kor: boolean;
  iso3: string;
  lang: string;
  rows: OccRow[];
  sel: string | null;
  select: (id: string | null) => void;
  selRow: OccRow | null;
  cells: GridCell[] | null;
  fit: Bbox | null;
  ready: boolean;
  VSW: Record<string, string>;
  areaName: string;
  tm: string;
  asOf: string | null;
  continent: string | null;
  failed: boolean;
};
