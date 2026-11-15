"use client";

import { Fragment, Suspense, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { countryName, useCountry } from "@/entities/country";
import { calendarQuery } from "@/entities/month-value";
import { methodQuery } from "@/entities/release";
import { api, qk, unwrap } from "@/shared/api";
import { ORDER } from "@/shared/data-cases";
import { useT, type TFn } from "@/shared/i18n";
import { useDevice } from "@/shared/lib/use-device";
import {
  CONTRACT,
  LIMS,
  SAT,
  SECS,
  STS,
  VS_CLS,
  VS_INFO,
  VS_KIND,
  aoiOfCountry,
  harmKeys,
  inRange,
  isSec,
  monthsOf,
  periods,
  pooledOrder,
  runs,
  scopeKey,
  scopeOrder,
  statusCounts,
  vsSegments,
  type MethodDoc,
  type MonthRow,
  type Sec,
} from "../model/method";
import { Kv, Panel, StIcon, Table, useNf } from "./bits";
import { cx } from "./cx";

/**
 * ③ 방법·검증 — 원천: 목업 pages/method.js · method.css (통합 방식 · v1.1 규칙 · 검증 · 자료 상태 · 출처·한계 5절).
 * 데이터: /methods/current(meta = release m2v_meta 그대로 — methodQuery) · /aois/{id}/calendar(calendarQuery). 다시 계산하지 않는다(A1).
 * release 에 숫자가 없는 칸(전 세계 편향 · 구간 포함률)은 「–」 + 「release 에 없음」. 계약에만 있는 상수(n20 1.013)는 출처 칸에 「계약 값」.
 * meta 의 서술 필드는 한국어 원문 → en 화면은 원문을 lang="ko" 로 접어 둔다.
 * 절 고르기는 주소 ?sec= 로 남는다(목업 #method?sec=).
 */
export function MethodPage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <MethodScreen />
    </Suspense>
  );
}

type CalDoc = { months: MonthRow[] };
interface Ctx {
  t: TFn;
  T: (k: string, v?: Record<string, string | number>) => string;
  W: (k: string, v?: Record<string, string | number>) => string;
  nf: ReturnType<typeof useNf>;
  lang: string;
  M: MethodDoc;
  cal: MonthRow[] | null;
  calErr: string | null;
  aoiName: string;
  aoiId: string;
  web: boolean;
}

function MethodScreen() {
  const t = useT();
  const lang = useLocale();
  const nf = useNf();
  const device = useDevice();
  const { iso3, info } = useCountry();
  const T = (k: string, v?: Record<string, string | number>) => t("method." + k, v);
  const W = (k: string, v?: Record<string, string | number>) => t("shell." + k, v);
  const sp = useSearchParams();
  /* 처음 절 = 주소 ?sec=(목업 #method?sec=). 고른 뒤에는 화면 상태가 이기고 주소는 replaceState 로만 따라간다 */
  const [sec, setSecState] = useState<Sec>(() => {
    const s0 = sp?.get("sec") ?? null;
    return isSec(s0) ? s0 : "method";
  });
  const secRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const mq = useQuery(methodQuery());
  const M = mq.data as MethodDoc | undefined;
  const mv = M?.method_version ?? null;
  const aoiId = aoiOfCountry(iso3);
  const cq = useQuery(calendarQuery(aoiId, { start_year: 2000, end_year: 2026 }, mv));
  const cal = typeof cq.data === "object" && cq.data ? (cq.data as unknown as CalDoc).months : null;
  const errCode = (e: unknown) => ((e as { code?: string } | null)?.code === "data_not_loaded" ? "data_not_loaded" : "network");
  const calErr = cq.error ? errCode(cq.error) : null;
  const aoiName = countryName(info, lang, iso3);

  const setSec = (s: Sec) => {
    setSecState(s);
    const u = new URL(window.location.href);
    if (s === "method") u.searchParams.delete("sec");
    else u.searchParams.set("sec", s);
    window.history.replaceState(window.history.state, "", u.toString());
    requestAnimationFrame(() => secRefs.current[s]?.focus({ preventScroll: true }));
  };

  const meta = M?.meta ?? {};
  const counts = [
    { key: "method" as Sec, label: T("k.periods"), value: M ? periods(M).length : null },
    { key: "validation" as Sec, label: T("k.scopes"), value: Object.keys(meta.validation_summary ?? {}).length || null },
    { key: "status" as Sec, label: T("k.nrt_months", { a: aoiName }), value: cal ? cal.filter((x) => x.status === "nrt").length : null },
    { key: "status" as Sec, label: T("k.missing_months", { a: aoiName }), value: cal ? cal.filter((x) => x.status === "missing").length : null },
  ];
  const ready = !!M && (cq.isFetched || !mv);
  const ctx: Ctx | null = M ? { t, T, W, nf, lang, M, cal, calErr, aoiName, aoiId, web: device === "web" } : null;

  return (
    <div className="h-full min-h-0 min-w-0" data-page="method">
      <div className={cx("mt")} data-testid="method" data-ready={ready ? "1" : "0"} data-sec={sec}>
        <header className={cx("pghd mt-head")}>
          <div className={cx("ph-1")}>
            <h1 tabIndex={-1}>{W("page.method")}</h1>
            <span className={cx("ph-scope")}>{[M?.method_version ?? "–", M?.data_version ?? "–"].join(" · ")}</span>
          </div>
          <div data-cnt="">
            <div className={cx("cntbar")} role="group" aria-label={W("counts.aria")}>
              {counts.map((c, i) => (
                <button key={i} type="button" className={cx("cb")} data-cnt={c.key} aria-pressed="false" onClick={() => setSec(c.key)}>
                  <span className={cx("cb-k")}>{c.label}</span>
                  <span className={cx("cb-vw")}>
                    <b className={cx("cb-v")}>{c.value == null ? "–" : c.value}</b>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className={cx("mt-bar")}>
          <div className={cx("seg mt-sec")} role="group" aria-label={T("ui.sections")}>
            {SECS.map((s) => (
              <button key={s} ref={(el) => void (secRefs.current[s] = el)} type="button" data-sec={s} aria-pressed={sec === s} onClick={() => setSec(s)}>
                {T("sec." + s)}
              </button>
            ))}
          </div>
        </div>
        <div className={cx("mt-body")}>
          {ctx ? (
            SEC_VIEW[sec](ctx)
          ) : mq.isError ? (
            <div className={cx("panel mt-p")}>
              <div className={cx("panel-b")}>
                <p className={cx("mt-err")}>{W("err." + errCode(mq.error))}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* 절 → 그리는 함수(처리기 맵 — switch 금지) */
const SEC_VIEW: Record<Sec, (c: Ctx) => ReactNode> = { method: (c) => <SecMethod {...c} />, v11: (c) => <SecV11 {...c} />, validation: (c) => <SecValidation {...c} />, status: (c) => <SecStatus {...c} />, sources: (c) => <SecSources {...c} /> };

/* 원문(한국어) 칸: ko 는 그대로(웹은 줄 수를 묶고 눌러 펼침), en 은 접은 행 */
function Src({ txt, c }: { txt: string | null | undefined; c: Ctx }) {
  if (txt == null || txt === "") return <>–</>;
  if (c.lang === "ko") return c.web ? <Clip txt={txt} /> : <span className={cx("mt-tx")}>{txt}</span>;
  return (
    <details className={cx("mt-ko")}>
      <summary>{c.T("ui.source_ko")}</summary>
      <span className={cx("mt-tx")} lang="ko">
        {txt}
      </span>
    </details>
  );
}
/* 웹 한 화면: 긴 글은 줄 수(--lc, 칸이 정함)로 묶고 눌러 펼친다. 글은 빠짐없이 DOM · title 에 있다 */
function Clip({ txt }: { txt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" className={cx("mt-clip")} data-open={open ? "1" : "0"} aria-expanded={open} title={open ? undefined : txt} onClick={() => setOpen((o) => !o)}>
      {txt}
    </button>
  );
}
function None({ c, k = "ui.not_in_release" }: { c: Ctx; k?: string }) {
  return (
    <span className={cx("mt-na")}>
      <StIcon st="out_of_range" />
      <span>{c.T(k)}</span>
    </span>
  );
}
function VsMark({ vs, c }: { vs: string; c: Ctx }) {
  return (
    <span className={cx("mt-vs")}>
      <i className={cx("an-segdot", VS_CLS[vs] ?? "af")} aria-hidden="true" />
      <b>{c.W("vsrc." + vs)}</b>
    </span>
  );
}
const Num = ({ children }: { children: ReactNode }) => <span className={cx("num")}>{children}</span>;

/* ── ① 통합 방식 ── */
function SecMethod(c: Ctx) {
  const { M, T, nf } = c;
  const meta = M.meta ?? {};
  const ev = meta.m2v_evaluation ?? {};
  const names = meta.model_names ?? {};
  const rows = periods(M).map((g) => {
    const inf = VS_INFO[g.value_source];
    return (
      <tr key={g.value_source} data-vs={g.value_source}>
        <td className={cx("num mt-per")}>
          {g.from ?? "–"} –{" "}
          <br />
          {g.to ?? T("ui.now")}
        </td>
        <td>
          <VsMark vs={g.value_source} c={c} />
        </td>
        <td className={cx("mt-hp")}>{T("kind." + (VS_KIND[g.value_source] ?? "observed"))}</td>
        <td>{(inf?.satellites ?? []).map((s) => SAT[s] ?? s).join(" · ") || "–"}</td>
        <td className={cx("mt-hp")}>{inf?.instrument ?? "–"}</td>
        <td className={cx("mt-hp")}>
          <Num>{inf?.model ?? "–"}</Num>
        </td>
      </tr>
    );
  });
  const fm = meta.final_method;
  const nr = ev.n_rounds_final ?? {};
  const pr = ev.params ?? {};
  const cl = ev.category_levels ?? {};
  const rel = <span className={cx("mt-dim")}>release</span>;
  const cRow = (k: ReactNode, v: string, s: ReactNode, key: string) => (
    <tr key={key}>
      <td>{k}</td>
      <td className={cx("r num")}>{v}</td>
      <td>{s}</td>
    </tr>
  );
  const coef = [
    cRow(<>{T("c.n20")} <Num>n20_bridge</Num></>, nf(CONTRACT.n20_bridge, 3), <><span className={cx("mt-src is-con")}>{T("ui.contract")}</span> <Src txt={meta.harmonization?.n20_bridge} c={c} /></>, "n20"),
    cRow(<>{T("c.rounds")} <Num>m2v_xgb</Num></>, nf(nr.m2v_xgb), rel, "r1"),
    cRow(<>{T("c.rounds")} <Num>m2v_xgb_terra</Num></>, nf(nr.m2v_xgb_terra), rel, "r2"),
    cRow(<>{T("c.rounds")} <Num>m2v_q10_q90</Num></>, nf(nr.m2v_q10_q90), rel, "r3"),
    cRow(T("c.lr"), nf(pr.learning_rate as number, 2), rel, "lr"),
    cRow(T("c.depth"), nf(pr.max_depth as number), rel, "dp"),
    cRow(T("c.features"), `${nf((ev.features ?? []).length)} · Terra ${nf((ev.terra_only_features ?? []).length)}`, rel, "ft"),
    cRow(T("c.levels"), `adm0 ${nf(cl.adm0_a3)} · subregion ${nf(cl.subregion)} · continent ${nf(cl.continent)}`, rel, "lv"),
    cRow(T("c.seed"), nf(meta.seed), rel, "sd"),
  ];
  const hk = harmKeys(meta.harmonization);
  return (
    <div className={cx("mt-grid")} data-g="method">
      <Panel title={T("p.periods")} wide w1 n={rows.length}>
        <Table heads={[[T("t.period")], [T("t.value")], [T("t.kind"), 0, "mt-hp"], [T("t.sat")], [T("t.sensor"), 0, "mt-hp"], [T("t.model"), 0, "mt-hp"]]} rows={rows} />
      </Panel>
      <Panel title={T("p.model")}>
        <Kv
          pairs={[
            [T("m.final"), <Fragment key="v"><Num>{fm ?? "–"}</Num>{fm && names[fm] ? <> · <Src txt={names[fm]} c={c} /></> : null}</Fragment>],
            [T("m.version"), <Num key="v">{meta.method_version ?? "–"}</Num>],
            [T("m.train"), <Num key="v">{meta.train_period ?? "–"}</Num>],
            [T("m.target"), <Src key="v" txt={meta.target} c={c} />],
            [T("m.zero"), <Src key="v" txt={meta.zero_rule} c={c} />],
            [T("m.eval"), <Src key="v" txt={meta.evaluation} c={c} />],
            [T("m.objective"), <Num key="v">{ev.objective ?? "–"}</Num>],
            [T("m.created"), <Num key="v">{meta.created ?? "–"}</Num>],
          ]}
        />
      </Panel>
      <Panel title={T("p.coef")}>
        <Table heads={[[T("t.item")], [T("t.val"), 1], [T("t.from")]]} rows={coef} cls="mt-coef" />
      </Panel>
      <Panel title={T("p.harm")} wide w1 n={c.web ? hk.length : null}>
        <details className={cx("mt-fold")} open={c.web}>
          <summary>{T("ui.rules_n", { n: hk.length })}</summary>
          <Table
            heads={[[T("h.key")], [T("h.rule")]]}
            rows={hk.map((k) => (
              <tr key={k}>
                <td className={cx("nw")}>
                  <Num>{k}</Num>
                </td>
                <td>
                  <Src txt={meta.harmonization?.[k]} c={c} />
                </td>
              </tr>
            ))}
            cls="mt-harm"
          />
        </details>
      </Panel>
    </div>
  );
}

/* ── ② 검증 ── */
function SecValidation(c: Ctx) {
  const { M, T, nf } = c;
  const meta = M.meta ?? {};
  const ev = meta.m2v_evaluation ?? {};
  const kp = ev.korea_pooled ?? {};
  const names = meta.model_names ?? {};
  const ad = ev.adopted ?? meta.final_method;
  const order = pooledOrder(kp, ad);
  const rows = order.map((k) => (
    <tr key={k} className={k === ad ? cx("is-sel") : undefined}>
      <td>
        <Num>{k}</Num>
        {k === ad ? <> <span className={cx("mt-ad")}>{T("v.adopted")}</span></> : null}
        <small className={cx("mt-nm2")}>
          <Src txt={names[k]} c={c} />
        </small>
      </td>
      <td className={cx("mt-hp")}>
        <Src txt={names[k]} c={c} />
      </td>
      <td className={cx("r num")}>{nf(kp[k]?.MAE, 1)}</td>
      <td className={cx("r num")}>{nf(kp[k]?.bias, 3)}</td>
    </tr>
  ));
  const kpA = (ad && kp[ad]) || null;
  const kpis: { k: string; v: string; d?: ReactNode }[] = [
    { k: T("v.kr_bias"), v: kpA ? nf(kpA.bias, 3) : "–", d: ad ?? "" },
    { k: T("v.kr_mae"), v: kpA ? nf(kpA.MAE, 1) : "–", d: T("v.mae_unit") },
    { k: T("v.world_bias"), v: "–", d: <None c={c} /> },
    { k: T("v.coverage"), v: "–", d: <None c={c} /> },
  ];
  const vs = meta.validation_summary ?? {};
  const scW = (k: string) => {
    const key = scopeKey(k);
    const w = c.t(key);
    return w === key ? k : w;
  };
  const vk = scopeOrder(Object.keys(vs));
  const sameRL = !!vs.korea && !!kp.ratio_lat && Math.abs((vs.korea?.mean ?? NaN) - (kp.ratio_lat?.MAE ?? NaN)) < 1e-6;
  const vRows = vk.map((k) => (
    <tr key={k}>
      <td>
        {scW(k)} <small className={cx("num mt-dim")}>{k}</small>
      </td>
      <td className={cx("r num")}>{nf(vs[k]?.mean, 1)}</td>
      <td className={cx("mt-hp")}>
        <Num>{vs[k]?.metric ?? ""}</Num>
      </td>
    </tr>
  ));
  const naRow = (label: string, key: string) => (
    <tr key={key}>
      <td>{label}</td>
      <td className={cx("r num")}>–</td>
      <td>
        <None c={c} />
      </td>
    </tr>
  );
  const cov = [
    naRow(T("v.coverage_lohi"), "cov"),
    naRow(T("v.world_bias"), "wb"),
    naRow(T("v.adopted_regional", { m: ad ?? "–" }), "ar"),
    <tr key="ai">
      <td>{T("v.aoi_interval")}</td>
      <td className={cx("r num")}>10 · 90</td>
      <td>
        <span className={cx("mt-src")}>release</span> <Src txt={meta.harmonization?.aoi_interval} c={c} />
      </td>
    </tr>,
  ];
  return (
    <>
      <div className={cx("kpirow mt-kpis")}>
        {kpis.map((it, i) => (
          <div key={i} className={cx("kp")}>
            <span className={cx("kp-k")}>{it.k}</span>
            <span className={cx("kp-v")}>{it.v}</span>
            {it.d ? <span className={cx("kp-d")}>{it.d}</span> : null}
          </div>
        ))}
      </div>
      <div className={cx("mt-grid mt-g4")}>
        <Panel title={T("p.kr_pooled")} wide w1 n={order.length}>
          <Table heads={[[T("t.model")], [T("t.name"), 0, "mt-hp"], [T("v.mae"), 1], [T("v.bias"), 1]]} rows={rows} />
          <Kv
            pairs={[
              [T("v.rule"), <Src key="v" txt={ev.adoption_rule} c={c} />],
              [T("v.reason"), <Src key="v" txt={meta.final_method_reason} c={c} />],
              [T("v.cv"), <Src key="v" txt={meta.evaluation} c={c} />],
            ]}
          />
        </Panel>
        <Panel
          title={
            <>
              {T("p.regions")}
              {sameRL ? (
                <>
                  {" "}
                  <span className={cx("mt-src")} title={`korea = ratio_lat ${nf(kp.ratio_lat?.MAE, 1)}`}>
                    ratio_lat
                  </span>
                </>
              ) : null}
            </>
          }
          n={vRows.length}
        >
          <Table heads={[[T("t.scope")], [T("v.mae"), 1], [T("t.metric"), 0, "mt-hp"]]} rows={vRows} />
        </Panel>
        <Panel title={T("p.interval")}>
          <Table heads={[[T("t.item")], [T("t.val"), 1], [T("t.from")]]} rows={cov} cls="mt-coef" />
        </Panel>
      </div>
    </>
  );
}

/* ── ③ 자료 상태(고른 나라 AOI 의 /calendar) ── */
function SecStatus(c: Ctx) {
  const { M, T, W, nf, cal } = c;
  if (!cal)
    return (
      <Panel title={T("p.status_aoi", { a: c.aoiName })}>
        <p className={cx("mt-err")}>{c.calErr ? W("err." + c.calErr) : "–"}</p>
      </Panel>
    );
  const inR = inRange(cal);
  const cnt = statusCounts(inR);
  const stRows = STS.filter((s) => s !== "out_of_range").map((s) => {
    const l = runs(monthsOf(inR, s));
    return (
      <tr key={s} data-st={s}>
        <td>
          <span className={cx("dst")} data-st={s} title={W("st_t." + s)}>
            <StIcon st={s} />
            <span className={cx("dst-w")}>{W("st." + s)}</span>
          </span>
        </td>
        <td className={cx("r num")}>{nf(cnt[s])}</td>
        <td className={cx("num mt-months")}>{s === "ok" ? "–" : l.length ? l.join(" · ") : "–"}</td>
      </tr>
    );
  });
  const vsRows = vsSegments(inR).map((g) => (
    <tr key={g.vs + g.from}>
      <td>
        <VsMark vs={g.vs} c={c} />
      </td>
      <td className={cx("num nw")}>
        {g.from} – {g.to}
      </td>
    </tr>
  ));
  /* 이 판 파일(실서버 files). 계약 경로 셋(aoi_month · compare · cells)은 늘 있다 — 실서버 files 에 이름이 없으면 있는 것으로 둔다(목업과 같음) */
  const files = M.files ?? {};
  const fRow = (k: string, on: boolean) => (
    <tr key={k}>
      <td>{T("f." + k)}</td>
      <td>{on ? <span className={cx("mt-src")}>release</span> : <None c={c} k="ui.not_provided" />}</td>
    </tr>
  );
  const ids = ORDER.filter((id) => id !== "ok" && c.t("shell.case." + id + ".why") !== "shell.case." + id + ".why");
  const iconOf: Record<string, string> = { interval_out: "low_sample", before_sensor: "out_of_range" };
  const wordOf = (id: string) => (id === "interval_out" || id === "low_sample" ? W("flag." + id) : W("st." + id));
  return (
    <div className={cx("mt-grid mt-g3")}>
      <Panel title={T("p.status_aoi", { a: c.aoiName })} wide w1>
        <Table heads={[[T("t.status")], [T("t.months"), 1], [T("t.which")]]} rows={stRows} />
        <p className={cx("mt-foot num")}>
          {T("ui.range")} 2000-11 – 2026-11 · {nf(inR.length)} {T("ui.months")}
        </p>
      </Panel>
      <Panel title={T("p.vs_aoi")} n={vsRows.length}>
        <Table heads={[[T("t.value")], [T("t.period")]]} rows={vsRows} />
      </Panel>
      <Panel title={T("p.files")}>
        <Table
          heads={[[T("t.item")], [T("t.from")]]}
          rows={[
            fRow("aoi_month", files.aoi_month !== false),
            fRow("compare", files.aoi_month_compare !== false),
            fRow("cells", files.harmonized_cell_month !== false),
            fRow("day_status", !!files.satellite_day_status),
            fRow("points", !!files.hotspots),
          ]}
        />
      </Panel>
      {ids.length ? (
        <Panel title={T("p.cases")} wide n={ids.length}>
          {c.web ? (
            <Table
              heads={[[T("t.status")], ...(["why", "what", "how", "opinion"] as const).map((f) => [T("case." + f)] as [ReactNode])]}
              rows={ids.map((id) => (
                <tr key={id} data-case={id}>
                  <td className={cx("nw")}>
                    <span className={cx("mt-ch")}>
                      <StIcon st={iconOf[id] ?? id} />
                      <b>{wordOf(id)}</b>
                    </span>
                  </td>
                  {(["why", "what", "how", "opinion"] as const).map((f) => (
                    <td key={f}>
                      <Clip txt={W("case." + id + "." + f)} />
                    </td>
                  ))}
                </tr>
              ))}
              cls="mt-ctab"
            />
          ) : (
          <ul className={cx("mt-cases")}>
            {ids.map((id) => (
              <li key={id} className={cx("mt-case")} data-case={id}>
                <div className={cx("mt-ch")}>
                  <StIcon st={iconOf[id] ?? id} />
                  <b>{wordOf(id)}</b>
                </div>
                <Kv pairs={(["why", "what", "how", "opinion"] as const).map((f) => [T("case." + f), W("case." + id + "." + f)])} />
              </li>
            ))}
          </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

/* ── ④ 출처·한계 ── */
function SecSources(c: Ctx) {
  const { M, T, W } = c;
  const srcs = (M.sources ?? []).map((s) => (
    <tr key={s.name}>
      <td>
        <b>{s.name}</b>
      </td>
      <td>{s.credit ?? [s.license, s.note].filter(Boolean).join(" · ")}</td>
      <td>
        {s.url ? (
          <a className={cx("mt-a")} href={s.url} target="_blank" rel="noopener">
            {String(s.url).replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          "–"
        )}
      </td>
    </tr>
  ));
  srcs.push(
    <tr key="release">
      <td>
        <b>release</b>
      </td>
      <td>{T("s.release")}</td>
      <td>
        <Num>{M.data_version ?? "–"}</Num>
      </td>
    </tr>,
  );
  const sats = [
    ["Terra · Aqua", "MODIS", "1 km"],
    ["Suomi NPP", "VIIRS", "375 m"],
    ["NOAA-20", "VIIRS", "375 m"],
  ].map((r) => (
    <tr key={r[0]}>
      <td>{r[0]}</td>
      <td>{r[1]}</td>
      <td className={cx("r num")}>{r[2]}</td>
    </tr>
  ));
  return (
    <div className={cx("mt-grid mt-g3")}>
      <Panel title={T("p.sources")} wide w2>
        <Table heads={[[T("t.item")], [T("t.what")], [T("t.where")]]} rows={srcs} />
      </Panel>
      <Panel title={T("p.sats")}>
        <Table heads={[[T("t.sat")], [T("t.sensor")], [T("t.res"), 1]]} rows={sats} />
      </Panel>
      <Panel title={T("p.unit")}>
        <Kv
          pairs={[
            [T("u.value"), W("unit.snpp_equiv")],
            [T("u.raw"), `${W("unit.modis_raw")} · ${W("unit.viirs_raw")}`],
            [T("u.month"), T("u.month_local")],
          ]}
        />
      </Panel>
      <Panel title={T("p.limits")} wide w2 n={LIMS.length}>
        <ul className={cx("mt-lims")}>
          {LIMS.map((k) => (
            <li key={k}>{W("lim." + k)}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ── v1.1 규칙(진행 중인 달 · 월 추정분 · 일별) — 진행 중인 달 값은 /calendar 의 partial 행(value · value_projected · as_of_date) 그대로 ── */
function SecV11(c: Ctx) {
  const { M, T, nf, cal } = c;
  const P = cal?.find((x) => x.status === "partial") ?? null;
  const line = P && P.as_of_date && P.value_projected != null ? c.t("analysis.g6.partial", { d: P.as_of_date, v: nf(P.value, 1), p: nf(P.value_projected, 1) }) : "";
  const part = P ? (
    <Kv
      pairs={[
        [T("v11.release"), <Num key="v">{M.data_version ?? "–"}</Num>],
        [T("v11.as_of"), <Num key="v">{P.as_of_date ?? "–"}</Num>],
        [T("v11.value"), <Num key="v">{nf(P.value, 1)}</Num>],
        [T("v11.proj"), <Num key="v">{nf(P.value_projected, 1)}</Num>],
        [T("v11.line"), line || "–"],
        [T("v11.verdict"), T("v11.verdict_t")],
      ]}
    />
  ) : (
    <None c={c} />
  );
  /* 월 추정분 합(목업 secV11 rs · rn — kr-daily 달 residual 합): 실서버 /summary(freq=day)는 한 번에 366일까지라 해마다 한 번씩 받아
     month_residual 을 더한다(값은 서버 그대로, 화면은 더하기만). 한국 지역만 · 하나라도 못 받으면 줄을 내지 않는다 */
  const rs = useResidSum(c.aoiId, M.method_version ?? null, P?.as_of_date ?? null);
  const res = (
    <Kv
      pairs={[
        [T("v11.r_where"), T("v11.r_where_t")],
        [T("v11.r_types"), T("v11.r_types_t")],
        [T("v11.r_use"), T("v11.r_use_t")],
        [T("v11.r_period"), T("v11.r_period_t")],
        ...(rs
          ? ([
              [
                `${c.aoiName} · ${T("v11.r_kr")}`,
                <span key="v" data-rsum="">
                  <Num>{nf(rs.sum, 1)}</Num> · <Num>{rs.n}</Num> {T("v11.months")}
                </span>,
              ],
            ] as [string, ReactNode][])
          : []),
      ]}
    />
  );
  const day = (
    <Kv
      pairs={[
        [T("v11.d_src"), T("v11.d_src_t")],
        [T("v11.d_area"), T("v11.d_area_t")],
        [T("v11.d_scope"), T("v11.d_scope_t", { d: P?.as_of_date ?? "–" })],
      ]}
    />
  );
  return (
    <div className={cx("mt-grid")}>
      <Panel title={`${T("v11.p_partial")} · ${c.aoiName}`}>{part}</Panel>
      <Panel title={T("v11.p_resid")}>{res}</Panel>
      <Panel title={T("v11.p_daily")}>{day}</Panel>
    </div>
  );
}

/** 월 추정분 합(2000-11 – 진행 중 달): 해마다 /aois/{id}/summary?freq=day 한 번(서버 한도 366일) → month_residual 합 · 0 아닌 달 수 */
function useResidSum(aoiId: string, mv: string | null, asOf: string | null) {
  const kor = /^(KR|SIDO_|SGG_)/.test(aoiId);
  const last = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null;
  const y1 = last ? +last.slice(0, 4) : 0;
  const years = kor && last ? Array.from({ length: y1 - 2000 + 1 }, (_, i) => 2000 + i) : [];
  const qs = useQueries({
    queries: years.map((y) => {
      const start = y === 2000 ? "2000-11-01" : `${y}-01-01`;
      const end = y === y1 ? (last as string) : `${y}-12-31`;
      return {
        queryKey: qk(`aois/${aoiId}/summary`, { start, end, freq: "day" }, mv),
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
          (await api.GET("/aois/{aoiId}/summary", { params: { path: { aoiId }, query: { start, end, freq: "day" } as never }, signal }).then(unwrap)) as unknown as {
            month_residual?: { month_residual?: number | null }[] | null;
          },
        staleTime: 24 * 60 * 60 * 1000,
        enabled: !!mv,
        retry: false,
      };
    }),
  });
  if (!years.length || qs.some((q) => !q.data)) return null;
  let sum = 0;
  let n = 0;
  qs.forEach((q) =>
    (q.data?.month_residual ?? []).forEach((r) => {
      const v = r.month_residual ?? 0;
      sum += v;
      if (v) n++;
    }),
  );
  return { sum, n };
}
