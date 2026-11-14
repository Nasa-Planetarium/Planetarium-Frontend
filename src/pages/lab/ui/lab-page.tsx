"use client";

import { Suspense, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { boundaryQuery, countryName, useCountry } from "@/entities/country";
import { useSession } from "@/entities/session";
import { ScopeButton, bboxCenter, rowWordKey, useAoiScope, type Bbox } from "@/features/pick-aoi";
import { api, unwrap } from "@/shared/api";
import { PAGES } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { useDevice } from "@/shared/lib/use-device";
import { PageFrame } from "@/widgets/page-frame";
import { LV_RANK, dimYM, lvOf, olRow, type LvKey, type Outlook, type Row } from "../model/outlook";
import { LabBand } from "./lab-band";
import { LabMap } from "./lab-map";
import { cx } from "./cx";
import { downloadText, toCSV, useFmt, useTv } from "./use-lab";

/**
 * 예측 분석(lab, 과학자) — 원천: 목업 pages/lab.js · lab.css(g6 확정본).
 * 숫자: 평년 기반 전망 스냅숏 /data/snap/outlook.json(결정 F8 — 실서버에 전망 경로 없음, 두 모드 같은 정적 파일) ·
 * 과거 관측은 /aois/{id}/calendar · 보정 검증은 /methods/current. 화면은 다시 계산하지 않는다.
 * 지도 = MapLibre 2D: 지역 경계 면을 수준 3단 색으로 채움(목업 lb-fc — 경계를 못 받으면 지역 중심 원, 결정 F9) + 이름·중앙값 표지.
 * 범위(2026-11-15 사용자 지적 「경북 북부 11개 시군만」): 한국은 고른 지역(?aoi=, 기본 대한민국)의 아래 단 전부 — 대한민국 → 17 시도, 시도 → 시군구.
 * 전망 스냅숏에 519 지역(세계·나라·시도·시군구)이 이미 있다(잰 것) — 그 par(위 단) 그대로 고른다.
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

const outlookQuery = {
  queryKey: ["static", "data/snap/outlook.json"],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetch(new URL("/data/snap/outlook.json", window.location.origin), { signal }).then((r) => {
      if (!r.ok) throw new Error(`outlook ${r.status}`);
      return r.json() as Promise<Outlook>;
    }),
  staleTime: Infinity,
};

interface AdmRegion {
  id: string;
  name_en: string;
  name_ko?: string;
  c: [number, number];
  area_km2: number;
}
export interface Region {
  id: string;
  name: string;
  lat: number;
  lon: number;
  aoi: string | null;
  area: number;
  /** 경계(계약 /aois/{id}/boundary — 한국 지역만, 못 받으면 null → 원) */
  geom?: unknown;
}
export type TV = (k: string, p?: Record<string, string | number>) => string;
export interface Sel {
  sel: string | null;
  select: (id: string | null) => void;
}

function LabScreen() {
  const t = useT();
  const lang = useLocale();
  const device = useDevice();
  const { iso3, info } = useCountry();
  const kor = iso3 === "KOR";
  const F = useFmt(kor);
  const oq = useQuery(outlookQuery);
  const O = oq.data ?? null;
  const { data: boundary } = useQuery({ ...boundaryQuery(iso3), enabled: !kor });
  const cname = countryName(info, lang, iso3);

  /* 한국: 고른 범위의 아래 단(전망 스냅숏 par) · 위치는 /aois bbox 가운데 · 면은 /aois/{id}/boundary */
  const S = useAoiScope();
  const scopeId = kor ? S.scope : `ADM0_${iso3}`;
  const krRows = useMemo(() => (kor && O ? O.aoi.filter((a) => a.par === scopeId) : []), [kor, O, scopeId]);
  const geoms = useQueries({
    queries: krRows.map((a) => ({
      queryKey: ["lab", "boundary", a.id, S.mv],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.GET("/aois/{aoiId}/boundary", { params: { path: { aoiId: a.id } }, signal }).then(unwrap) as Promise<unknown>,
      enabled: !!S.mv,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const geomKey = geoms.map((g) => (g.data ? 1 : 0)).join("");
  const regions: Region[] = useMemo(() => {
    if (kor)
      return krRows.map((a, i) => {
        const rec = S.byId.get(a.id);
        const c = bboxCenter(rec?.bbox);
        return { id: a.id, name: rec ? S.nameOf(rec) : a.name, lat: c?.lat ?? NaN, lon: c?.lon ?? NaN, aoi: a.id, area: 0, geom: geoms[i]?.data ?? null };
      });
    const adm = ((boundary as { regions?: AdmRegion[] } | undefined)?.regions ?? []).slice();
    return adm.map((r) => ({ id: r.id, name: (lang === "ko" && r.name_ko) || r.name_en, lat: r.c[1], lon: r.c[0], aoi: null, area: r.area_km2 }));
    // geoms 는 쿼리마다 새 배열이라 받은 여부(geomKey)로만 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kor, krRows, S.byId, S.nameOf, boundary, lang, geomKey]);
  const fitBbox: Bbox | null = kor ? ((S.byId.get(scopeId)?.bbox as Bbox | undefined) ?? null) : null;

  const rowLevel = kor ? (S.byId.get(krRows[0]?.id ?? "")?.level ?? (scopeId === "KR" ? "kr_sido" : "kr_sgg")) : "adm1";
  const aoiLabel = kor ? S.nameOf(scopeId) : cname;
  const rw = t(rowWordKey(rowLevel));
  const T_ = useTv({ rw, rw1: rw, Rw1: rw, aoi: aoiLabel, tz: kor ? "KST" : "UTC" });
  const totId = scopeId;

  const FC = useMemo(() => {
    if (!O) return null;
    const ix = new Map(O.aoi.map((a) => [a.id, a]));
    const tm = O.method.targets[0] as string;
    const rows: Row[] = regions.map((r) => olRow(r.aoi ? (ix.get(r.aoi) ?? null) : null, 0, r.id, r.name));
    const total = olRow(ix.get(totId) ?? null, 0, "all", aoiLabel);
    return { ix, rows, total, issued: O.method.computed_at.slice(0, 10), month: tm, days: dimYM(tm), targets: O.method.targets.slice(), m: O.method };
  }, [O, regions, totId, aoiLabel]);

  /* 고른 행: 범위가 바뀌면 비운다 · 시군구 하나를 골라 들어왔으면(?aoi=SGG_…) 그 행 */
  const [sel, setSel] = useState<{ iso: string; scope: string; id: string | null } | null>(null);
  const selId = sel && sel.iso === iso3 && sel.scope === scopeId ? sel.id : kor ? S.focus : null;
  const select = (id: string | null) => setSel({ iso: iso3, scope: scopeId, id });
  const [lvf, setLvf] = useState<LvKey | null>(null);
  const [sort, setSort] = useState<{ k: string; dir: number }>({ k: "median", dir: -1 });

  const rowOf = (id: string | null) => (FC ? (id ? (FC.rows.find((r) => r.region_id === id) ?? null) : FC.total) : null);
  const selRow = rowOf(selId);
  const regLabel = selId ? (regions.find((r) => r.id === selId)?.name ?? selId) : (FC?.total.region_name ?? aoiLabel);
  const selAoi = selId ? (regions.find((r) => r.id === selId)?.aoi ?? null) : totId;
  const ph = device === "phone";

  /* ── 머리: 화면 이름 + 범위 + 개수 띠(권역 예측 · 평년보다 높음 시군 수) ── */
  const head = () => {
    const tt = FC?.total;
    const b = tt?.baseline;
    const nHigh = FC ? FC.rows.filter((r) => lvOf(r) === "high").length : 0;
    const ratio = tt && tt.median != null && b?.p50 ? tt.median / b.p50 : null;
    const C = [
      { key: "tot", label: ph ? T_("lab.ui.forecast") : T_("lab.ui.area_forecast"), value: tt?.median == null ? "–" : F.n1(tt.median), delta: ratio == null ? null : T_("lab.ui.vs_normal") + ratio.toFixed(1) + T_("lab.ui.s101"), unit: null as string | null, pressed: !lvf && !selId },
      { key: "high", label: t("data.fc.level.high"), value: String(nHigh), delta: null, unit: T_(nHigh === 1 ? "lab.ui.s324_one" : "lab.ui.s324"), pressed: lvf === "high" },
    ];
    const scope = FC ? T_("lab.g6.scope", { a: FC.total.region_name, m: FC.targets.map(F.ymS).join(" · ") }) : "";
    return (
      <header className={cx("pghd")}>
        <div className={cx("ph-1")}>
          <h1>{T_("lab.ui.forecast2")}</h1>
          {scope ? <span className={cx("ph-scope")}>{scope}</span> : null}
          {kor ? (
            <div className={cx("ph-tools")}>
              <ScopeButton s={S} size="sm" />
            </div>
          ) : null}
        </div>
        <div className={cx("cntbar")} role="group" aria-label={t("shell.counts.aria")}>
          {C.map((c) => (
            <button
              key={c.key}
              type="button"
              className={cx("cb")}
              data-cnt={c.key}
              aria-pressed={c.pressed}
              onClick={() => {
                if (c.key === "tot") {
                  setLvf(null);
                  select(null);
                } else setLvf((v) => (v === "high" ? null : "high"));
              }}
            >
              <span className={cx("cb-k")}>{c.label}</span>
              <span className={cx("cb-vw")}>
                <b className={cx("cb-v")}>{c.value}</b>
                {c.unit ? <span className={cx("cb-u")}>{c.unit}</span> : null}
                {c.delta ? <span className={cx("cb-d")}>{c.delta}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </header>
    );
  };

  /* ── 권역 합계: 평년 대비 구간 그림 하나 ── */
  const total = () => {
    const tt = FC?.total;
    if (!tt || tt.median == null || tt.hi80 == null || tt.baseline.p90 == null) return <p className={cx("lb-empty")}>{T_("lab.ui.insufficient_data")}</p>;
    const b = tt.baseline;
    const mx = Math.max(tt.hi80, b.p90 ?? 0) * 1.12;
    const P = (v: number | null) => `${(((v ?? 0) / mx) * 100).toFixed(2)}%`;
    return (
      <>
        <div className={cx("lb-toth")}>
          <span className={cx("lb-totk")}>{T_("lab.ui.whole_area_vs_normal")}</span>
          <span className={cx("lb-totu")}>{T_("lab.g6.unit")}</span>
        </div>
        <div className={cx("lb-totbar")} role="img" aria-label={`${T_("lab.ui.normal_p10")}${F.n1(b.p10, b.p90)}–p90 ${F.n1(b.p90, b.p10)}${T_("lab.ui.vs_forecast_80_interval")}${F.n1(tt.lo80, tt.hi80)}–${F.n1(tt.hi80, tt.lo80)}`}>
          <i className={cx("lb-tb-b")} style={{ left: P(b.p10), width: `calc(${P(b.p90)} - ${P(b.p10)})` }} />
          <i className={cx("lb-tb-p")} style={{ left: P(b.p50) }} />
          <i className={cx("lb-tb-f", "lb-lv-" + lvOf(tt))} style={{ left: P(tt.lo80), width: `calc(${P(tt.hi80)} - ${P(tt.lo80)})` }} />
          <i className={cx("lb-tb-m")} style={{ left: P(tt.median) }} />
          <span className={cx("lb-tbl-f")} style={{ left: P(((tt.lo80 ?? 0) + tt.hi80) / 2) }}>
            {T_("lab.ui.forecast_80")}
            <span className={cx("num")}>
              {F.n1(tt.lo80, tt.hi80)}–{F.n1(tt.hi80, tt.lo80)}
            </span>
          </span>
          <span style={{ left: P(b.p50) }}>{T_("lab.ui.normal")}</span>
        </div>
      </>
    );
  };

  /* ── 정렬 가능한 표 ── */
  const LVW: Record<LvKey, string> = { high: T_("lab.ui.high"), normal: T_("lab.ui.normal"), low: T_("lab.ui.low"), na: T_("lab.ui.n_a") };
  const COLS = [
    { k: "name", t: T_("lab.ui.s358"), get: (r: Row) => r.region_name as string | number | null },
    { k: "median", t: T_("lab.ui.median"), r: true, get: (r: Row) => r.median },
    { k: "range", t: T_("lab.ui.80_interval_vs_normal"), get: (r: Row) => r.hi80 },
    { k: "p50", t: T_("lab.ui.normal_p502"), r: true, get: (r: Row) => r.baseline.p50, cls: "lb-c-p50" },
    { k: "level", t: T_("lab.ui.level"), get: (r: Row) => LV_RANK[lvOf(r)] * 1000 + (r.median ?? 0) / Math.max(1, r.baseline.p50 ?? 1) },
  ];
  const table = () => {
    if (!FC) return null;
    const col = COLS.find((c) => c.k === sort.k) ?? COLS[1]!;
    const rows = FC.rows
      .filter((r) => !lvf || lvOf(r) === lvf)
      .sort((a, b) => {
        const x = col.get(a);
        const y = col.get(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(String(y), lang) : (x as number) - (y as number)) * sort.dir;
      });
    const mx = Math.max(1e-9, ...FC.rows.map((r) => Math.max(r.hi80 ?? 0, r.baseline.p90 ?? 0))) * 1.06;
    const P = (v: number | null) => `${(((v ?? 0) / mx) * 100).toFixed(2)}%`;
    return (
      <table className={cx("tbl is-row lb-ft", !(lang === "ko" && kor) && "lb-ft-wide")} data-ft="">
        <caption className={cx("lb-sr")}>{T_("lab.ui.30_day_forecast_by_sort_by_c")}</caption>
        <thead>
          <tr>
            {COLS.map((c) => {
              const on = sort.k === c.k;
              return (
                <th key={c.k} className={cx(c.r && "r", c.cls) || undefined} aria-sort={on ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
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
          {rows.map((r) => {
            const on = selId === r.region_id;
            const k = lvOf(r);
            return (
              <tr key={r.region_id} className={on ? cx("on") : undefined} data-r={r.region_id} onClick={() => select(on ? null : r.region_id)}>
                <td>
                  <button type="button" className={cx("lb-rbtn")} data-r={r.region_id} aria-pressed={on}>
                    {r.region_name}
                  </button>
                </td>
                <td className={cx("num r lb-c-med")}>{F.n1(r.median)}</td>
                <td className={cx("lb-c-rng")}>
                  <div className={cx("lb-rng")}>
                    {r.median == null ? (
                      <span className={cx("lb-rb lb-rb-na")}>{T_("lab.ui.insufficient_data")}</span>
                    ) : (
                      <>
                        <span className={cx("lb-rb")} aria-hidden="true">
                          <i className={cx("lb-rb-b")} style={{ left: P(r.baseline.p10), width: `calc(${P(r.baseline.p90)} - ${P(r.baseline.p10)})` }} />
                          <i className={cx("lb-rb-f", "lb-lv-" + k)} style={{ left: `min(${P(r.lo80)},calc(${P(((r.lo80 ?? 0) + (r.hi80 ?? 0)) / 2)} - 5px))`, width: `max(10px,calc(${P(r.hi80)} - ${P(r.lo80)}))` }} />
                          <i className={cx("lb-rb-m")} style={{ left: P(r.median) }} />
                        </span>
                        <span className={cx("lb-rt num")}>
                          {F.n1(r.lo80, r.hi80)}–{F.n1(r.hi80, r.lo80)}
                        </span>
                      </>
                    )}
                  </div>
                </td>
                <td className={cx("num r lb-c-p50")}>{F.n1(r.baseline.p50)}</td>
                <td>
                  <span className={cx("lb-lvs", "lb-lv-" + k)}>{LVW[k]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const regionCSV = () => {
    if (!FC) return;
    const q2 = (v: number | string | null | undefined) => (v == null ? "" : v);
    const rows = [FC.total, ...FC.rows];
    downloadText(
      `emberline_outlook_${FC.month}.csv`,
      toCSV(rows, [
        { label: "region_id", get: (r) => r.region_id },
        { label: "aoi_id", get: (r) => q2(r.aoi_id) },
        { label: "region_name", get: (r) => r.region_name },
        { label: "issued", get: () => FC.issued },
        { label: "target_month", get: () => FC.month },
        { label: "unit", get: () => T_("lab.g6.unit") },
        { label: "forecast_median", get: (r) => q2(r.median) },
        { label: "forecast_lo80", get: (r) => q2(r.lo80) },
        { label: "forecast_hi80", get: (r) => q2(r.hi80) },
        { label: "forecast_verdict", get: (r) => q2(r.verdict) },
        { label: "ratio_to_base_median", get: (r) => q2(r.ratio) },
        { label: "baseline_p10", get: (r) => q2(r.baseline.p10) },
        { label: "baseline_p50", get: (r) => q2(r.baseline.p50) },
        { label: "baseline_p90", get: (r) => q2(r.baseline.p90) },
        { label: "partial_value_to_date", get: (r) => (r.ol?.pt != null ? r.ol.pt / 10 : "") },
        { label: "partial_value_projected", get: (r) => (r.ol?.ptp != null ? r.ol.ptp / 10 : "") },
        { label: "partial_as_of", get: () => FC.m.partial_as_of },
        { label: "loyo_cover80", get: (r) => (r.ol ? (r.ol.cov[0] ?? 0) / 1000 : "") },
        { label: "loyo_mae_log", get: (r) => (r.ol ? (r.ol.mae[0] ?? 0) / 1000 : "") },
        { label: "loyo_mae_log_climo", get: (r) => (r.ol ? (r.ol.mae0[0] ?? 0) / 1000 : "") },
        { label: "method", get: () => FC.m.id },
        { label: "input_release", get: () => FC.m.input?.release ?? "" },
      ]),
    );
  };
  const totalTxt = (() => {
    const s = t("shell.list.total", { n: "\u0000", u: T_("lab.ui.s324") });
    const [a, b] = s.split("\u0000");
    return (
      <>
        {a}
        <b>{F.num(FC?.rows.length ?? regions.length)}</b>
        {b}
      </>
    );
  })();

  const ctx = { FC, O, F, T_, t, kor, regions, sel: selId, select, rowOf, selRow, regLabel, selAoi, lang, device, fitBbox };

  return (
    <div className="min-h-0 min-w-0" data-page="lab">
      <div className={cx("lb")} data-testid="lab" data-ready={FC ? "1" : "0"}>
        <div className={cx("lb-screen")}>
          <div className={cx("lb-head")}>{head()}</div>
          <section className={cx("lb-stage")} aria-label={T_("lab.ui.30_day_outlook_map_by")}>
            <LabMap {...ctx} />
          </section>
          <aside className={cx("lb-side")} aria-label={T_("lab.ui.outlook_table_by")}>
            <section className={cx("panel lb-tot")}>{total()}</section>
            <section className={cx("panel lb-tblp")}>
              <div className={cx("listhead")}>
                <h3 className={cx("lh-t")}>{T_("lab.ui.outlook_by")}</h3>
                <span className={cx("lh-n")}>{totalTxt}</span>
                <span className={cx("lh-a")}>
                  <button type="button" className={cx("btn sm ghost")} data-x="reg" aria-label={T_("lab.ui.download_30_day_outlook_tabl")} onClick={regionCSV}>
                    {T_("lab.ui.table_csv")}
                  </button>
                </span>
              </div>
              <div className={cx("lb-tblwrap")}>{table()}</div>
              <p className={cx("lb-cap lb-tcap")}>
                <span className={cx("lb-rbk")}>
                  <i className={cx("lb-rbk-b")} />
                  {T_("lab.ui.normal_p10_p90")}
                </span>
                <span className={cx("lb-rbk")}>
                  <i className={cx("lb-rbk-f")} />
                  {T_("lab.ui.forecast_80_interval")}
                </span>
                <span className={cx("lb-rbk")}>
                  <i className={cx("lb-rbk-m")} />
                  {T_("lab.ui.forecast_median")}
                </span>
              </p>
            </section>
          </aside>
        </div>
        <LabBand {...ctx} />
      </div>
    </div>
  );
}
export type LabCtx = {
  FC: {
    ix: Map<string, import("../model/outlook").OutlookAoi>;
    rows: Row[];
    total: Row;
    issued: string;
    month: string;
    days: number;
    targets: string[];
    m: import("../model/outlook").OutlookMethod;
  } | null;
  O: Outlook | null;
  F: ReturnType<typeof useFmt>;
  T_: TV;
  t: (k: string, p?: Record<string, string | number>) => string;
  kor: boolean;
  regions: Region[];
  sel: string | null;
  select: (id: string | null) => void;
  rowOf: (id: string | null) => Row | null;
  selRow: Row | null;
  regLabel: string;
  selAoi: string | null;
  lang: string;
  device: string;
  fitBbox: Bbox | null;
};
