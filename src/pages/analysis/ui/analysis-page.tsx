"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { countryName, pickableAois, pickableIso3, useCountry } from "@/entities/country";
import { methodQuery } from "@/entities/release";
import { ApiError } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { prefs } from "@/shared/lib/prefs";
import { useDevice } from "@/shared/lib/use-device";
import { aoisQuery, calendarAllQuery, comparisonQuery, type AoiRec } from "../api/queries";
import { AOI_OK, KOR_AOIS, coverage, defaultAoi, isStep, monthRec, regimes, selectable, ymK, type Step } from "../model/analysis";
import { aoiOfIso3, iso3OfAoi, LAST, lastMonth, monthIndex, monthWord, nameEn, VIEWS, ymIso, ymOfIndex, type CalView } from "../model/core";
import { AoiPicker } from "./aoi-picker";
import { Status, StIcon } from "./bits";
import { Track, useNf } from "./charts";
import { cx } from "./cx";
import { S2 } from "./s2";
import { BoundaryPreview, Eras } from "./s1-side";
import { PrintDoc, S3 } from "./s3";
import { QuickPick } from "./quick-pick";
import type { Ctx, MethodDoc } from "./types";
import { VdMark } from "./vd-mark";
import { WorldReplay } from "./world";

/**
 * ② 비교 분석 3단계(S1 범위 → S2 캘린더·비교 → S3 근거·보고) — 원천: 목업 pages/analysis.js · analysis.css(g6 확정본).
 * 데이터: 계약 /api/v1 만(aois · calendar · comparison · cells · summary · methods/current). 값·판정은 release 그대로(A1), 경우 가르기는 judgeMonth(E4).
 * 주소: ?step=1|2|3&aoi=<aoi_id>&ym=YYYY-MM&view=… (목업 #analysis?… 와 같은 키). 캘린더 「비교 분석」이 step=2 로 넘긴다.
 * S1 경계 미리보기 = 지금 나라 1급 경계 + 고른 지역 강조(전 지역, s1-side.tsx) · 지원 기간 아래 위성 연대 띠.
 * 상태 읽는 순서(목업 analysis.js S): 넘김(from=home|ops) → 주소 → em.an.v3(sessionStorage — 같은 탭 안에서만) → 기본. 주소에 분석 키가 하나도 없을 때만 em.an.v3 를 주소로 옮긴다. 새 창·다음 사람은 주소에 조건이 없으면 기본 상태(공유 링크는 주소 그대로).
 * 목업과 다른 점(남은 차이): 미리보기 하천 없음(전국 선 자료 없음 — 사람 결정 W0).
 */
export function AnalysisPage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <AnalysisScreen />
    </Suspense>
  );
}

const isView = (v: string | null): v is CalView => !!v && (VIEWS as readonly string[]).includes(v);
/** em.an.v3(목업 analysis.js KEY) — 단계·지역·해·달·보기. 저장소가 없거나 모양이 틀리면 null */
function readSaved(): { step?: unknown; aoi?: unknown; year?: unknown; month?: unknown; view?: unknown } | null {
  try {
    const o: unknown = JSON.parse(prefs.get("an.v3") ?? "null");
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function AnalysisScreen() {
  const t = useT();
  const lang = useLocale();
  const device = useDevice();
  const router = useRouter();
  const pathname = usePath();
  const sp = useQueryParams();
  const nf = useNf();
  const { iso3, list: countries } = useCountry();
  const KOR = iso3 === "KOR";
  const T = useCallback((k: string, v?: Record<string, string | number>) => t(`analysis.${k}`, v), [t]);
  const W = useCallback((k: string, v?: Record<string, string | number>) => t(`shell.${k}`, v), [t]);

  const mq = useQuery(methodQuery());
  const M = (mq.data ?? null) as MethodDoc | null;
  const mv = M?.method_version ?? null;
  const aq = useQuery(aoisQuery(mv));
  const byId = useMemo(() => new Map((aq.data ?? []).map((a) => [a.aoi_id, a] as const)), [aq.data]);
  const has = useCallback((id: string) => byId.has(id), [byId]);

  /* 지역: 주소 aoi(모양·목록 확인) → 지금 나라 단위(한국 = KR, 다른 나라와 같은 규칙) → 없으면 옛 기본(경북 북부 묶음·경북) */
  const urlAoi = sp.get("aoi");
  const aoi = useMemo(() => {
    if (!aq.data) return null;
    if (urlAoi && AOI_OK(urlAoi) && has(urlAoi) && !(KOR && /^ADM0_/.test(urlAoi))) return urlAoi;
    if (has(aoiOfIso3(iso3))) return aoiOfIso3(iso3);
    return defaultAoi(has);
  }, [aq.data, urlAoi, has, KOR, iso3]);
  const rec: AoiRec | null = aoi ? (byId.get(aoi) ?? null) : null;

  const cq = useQuery({ ...calendarAllQuery(aoi ?? "KR", mv), enabled: !!mv && !!aoi });
  const cal = cq.data && cq.data.aoi_id === aoi ? cq.data : null;
  const inScope = !!rec && rec.has_data !== false && !!cal;
  /* 나라 드롭다운의 「전체」(WORLD)는 전 세계 캘린더가 실제로 받아질 때만 — 목 스냅숏은 지역 목록에 WORLD 가 있어도 캘린더가 404 라
     고르면 달·단계·분석 보기가 모두 잠겨 빠져나오기 어렵다(로컬). 같은 질의 키라 WORLD 를 고르면 캐시를 그대로 쓴다 */
  const wq = useQuery({ ...calendarAllQuery("WORLD", mv), enabled: !!mv && has("WORLD") });
  const worldOk = !!wq.data;

  const view: CalView = isView(sp.get("view")) ? (sp.get("view") as CalView) : "value";
  /* 주소 ym 이 없으면 고른 지역 캘린더의 마지막 관측 달(고정 사례 달 아님) */
  const ymDef = cal ? ymIso(...lastMonth(cal)) : ymIso(LAST[0], LAST[1]);
  const ymQ = /^\d{4}-\d{2}$/.test(sp.get("ym") ?? "") ? (sp.get("ym") as string) : ymDef;
  /* 연도 고르기는 달을 바꾸기 전까지 화면 안 상태(주소 ym 이 바뀌면 그 해로 돌아간다) */
  const [yrSt, setYrSt] = useState<{ k: string; y: number } | null>(null);
  const yr = yrSt && yrSt.k === ymQ ? yrSt.y : +ymQ.slice(0, 4);
  const setYr = (yy: number) => setYrSt({ k: ymQ, y: yy });
  const qy = +ymQ.slice(0, 4);
  const qm = +ymQ.slice(5, 7);
  /* 고를 수 없는 달(진행 중 · 결측 · 지원 밖)은 「달 미선택」 */
  const month = cal && selectable(cal, qy, qm) ? qm : null;
  const blocked = !inScope || !month;
  const wantStep = isStep(sp.get("step")) ?? 1;
  const step: Step = blocked ? 1 : wantStep;
  const ym = month ? ymIso(qy, month) : "";

  const kq = useQuery(comparisonQuery(aoi ?? "KR", ym || "2000-01", mv, !!aoi && !blocked));
  const c = !blocked && kq.data ? kq.data : null;
  /* 달을 바꾸면 새 응답이 올 때까지 앞 달 값을 그대로 둔다(빈 화면으로 갔다 오지 않게) — 표시는 은은하게만 */
  const stale = !!c && kq.isPlaceholderData;

  const writeQ = useCallback(
    (patch: Record<string, string | null>, push = false, country?: string) => {
      const q = new URLSearchParams(sp.toString());
      Object.entries(patch).forEach(([k, v]) => (v == null ? q.delete(k) : q.set(k, v)));
      if (country) {
        if (country === "KOR") q.delete("c");
        else q.set("c", country);
        prefs.set("country", country);
      }
      const s = q.toString();
      const href = `${pathname}${s ? `?${s}` : ""}`;
      if (push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [sp, router, pathname],
  );
  const h1 = useRef<HTMLHeadingElement>(null);
  const go = useCallback(
    (s: Step) => {
      writeQ({ step: String(s), aoi, ym: ym || null }, true);
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
        h1.current?.focus({ preventScroll: true });
      });
    },
    [writeQ, aoi, ym],
  );

  const aoiName = useCallback(
    (a: AoiRec | null) => {
      if (!a) return countryName(countries.find((x) => x.iso3 === iso3), lang, iso3);
      if (a.aoi_id === "WORLD") return T("g5.world");
      const i3 = a.level === "country" ? iso3OfAoi(a.aoi_id) : null;
      if (i3) return countryName(countries.find((x) => x.iso3 === i3), lang, a.name_ko ?? a.aoi_id);
      return (lang === "ko" ? a.name_ko : nameEn(a)) || a.name_ko || nameEn(a) || a.aoi_id;
    },
    [countries, iso3, lang, T],
  );

  const rule = M?.verdict_rule ?? null;
  const base = { from: rule?.baseline?.from ?? rule?.baseline_from ?? 2001, to: rule?.baseline?.to ?? rule?.baseline_to ?? 2025 };
  const fail = kq.error ?? cq.error ?? aq.error ?? mq.error;
  const errWord = fail ? W(fail instanceof ApiError && (fail.code === "data_not_loaded" || fail.code === "rate_limited") ? `err.${fail.code}` : "err.network") : null;
  const ready = !!aq.data && (!aoi || !!cal || !!cq.error) && (step === 1 || !!c || !!kq.error);

  /* em.an.v3: 주소에 분석 키가 없으면(메뉴로 들어옴) 지난 작업(단계·지역·달·보기)을 주소로 되살린다 — 한 번만 */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (["step", "aoi", "ym", "view", "from"].some((k) => sp.get(k) != null)) return;
    const o = readSaved();
    if (!o) return;
    const p: Record<string, string | null> = {};
    if (typeof o.aoi === "string" && AOI_OK(o.aoi)) p.aoi = o.aoi;
    if (typeof o.year === "number" && typeof o.month === "number" && o.month >= 1 && o.month <= 12) p.ym = ymIso(o.year, o.month);
    if (typeof o.view === "string" && isView(o.view) && o.view !== "value") p.view = o.view;
    if (o.step === 2 || o.step === 3) p.step = String(o.step);
    if (Object.keys(p).length) writeQ(p);
  }, [sp, writeQ]);
  useEffect(() => {
    if (!ready || !aoi) return;
    prefs.set("an.v3", JSON.stringify({ step, aoi, year: qy, month: month ?? null, view }));
  }, [ready, aoi, step, qy, month, view]);

  const ctx: Ctx = { t, T, W, lang, nf, device, aoi: aoi ?? "", rec, cal, c, stale, M, view, y: qy, m: month ?? qm, base, aoiName, writeQ, go, errWord, has };

  const counts: { key: string; label: string; value: string; unit?: string }[] = [];
  if (step > 1 && c && c.value != null) {
    counts.push({ key: "val", label: T(step === 2 && view !== "value" ? "g3.k_value_harm" : "g3.k_value"), value: nf(c.value) });
    if (c.ratio_to_median != null) counts.push({ key: "ratio", label: T("ui.vs_median"), value: c.ratio_to_median.toFixed(1), unit: T("ui.s101") });
    if (c.percentile != null) counts.push({ key: "pct", label: T("g3.k_pct"), value: nf(c.percentile), unit: `n ${c.n_baseline_years ?? "–"}` });
  }
  const stepWords = [T("g3.step1"), T("g3.step2"), T("g3.step3")];

  return (
    <div className="min-h-full min-w-0" data-page="analysis">
      <div className={cx("an")} data-testid="analysis" data-step={step} data-ready={ready ? "1" : "0"} data-aoi={aoi ?? ""} data-ym={ym} data-view={view} data-busy={stale ? "1" : undefined}>
        <header className={cx("pghd an-head")}>
          <div className={cx("ph-1")}>
            <h1 tabIndex={-1} ref={h1}>
              {T("ui.comparison")}
            </h1>
            <span className={cx("ph-scope")}>
              {inScope ? aoiName(rec) : aoiName(null)}
              {month && inScope ? `, ${ym}` : ""} · {T("g3.baseline_fixed", { a: base.from, b: base.to })}
            </span>
            <span className={cx("an-hst")}>
              {!inScope && cal ? <Status st="out_of_range" /> : step > 1 && c ? c.verdict ? <VdMark v={c.verdict} p={c.percentile ?? null} /> : <Status st={c.status} /> : null}
            </span>
          </div>
          <div className={cx("an-steps")}>
            <ol className={cx("stages is-nav is-num")} aria-label={T("ui.analysis_steps")}>
              {stepWords.map((w, i) => {
                const n = (i + 1) as Step;
                return (
                  <li key={n} className={cx(n < step ? "is-done" : n === step ? "is-now" : null)}>
                    <button type="button" data-step={n} aria-current={n === step ? "step" : undefined} disabled={n > 1 && blocked} onClick={() => go(n)}>
                      <span className={cx("sg-ck")}>
                        <span className={cx("sg-n", n < step && "is-ck")} aria-hidden="true">
                          {n < step ? <Check className={cx("ic ic-inline")} /> : n}
                        </span>
                        {w}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {step > 1 ? <QuickPick T={T} lang={lang} countries={countries} pick={pickableIso3(countries, aq.data)} iso3={aoi === "WORLD" ? "WORLD" : (aoi && iso3OfAoi(aoi)) || iso3} hasWorld={worldOk} y={qy} m={month ?? qm} step={step} writeQ={writeQ} /> : null}
          {counts.length ? (
            <div className={cx("cntbar")} role="group" aria-label={W("counts.aria")}>
              {counts.map((k) => (
                <button key={k.key} type="button" className={cx("cb")} data-cnt={k.key} aria-pressed="false" onClick={() => document.querySelector("[data-an-body]")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  <span className={cx("cb-k")}>{k.label}</span>
                  <span className={cx("cb-vw")}>
                    <b className={cx("cb-v")}>{k.value}</b>
                    {k.unit ? <span className={cx("cb-u")}>{k.unit}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </header>
        <div className={cx("an-body")} data-an-body="">
          {!ready && !errWord ? null : step === 1 ? <S1 x={ctx} KOR={KOR} yr={yr} setYr={setYr} inScope={inScope} iso3={iso3} /> : step === 2 ? <S2 x={ctx} /> : <S3 x={ctx} />}
          {/* 1·2단계에서 인쇄해도 3단계와 같은 종이 요약(목업 addPrint) — 결과가 없으면 「인쇄할 결과 없음」 */}
          {ready && step !== 3 ? (
            <div className={cx("an-pwrap")} data-pwrap="">
              <PrintDoc x={ctx} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ═════════ 1 범위 ═════════ */
function S1({ x, KOR, yr, setYr, inScope, iso3 }: { x: Ctx; KOR: boolean; yr: number; setYr: (y: number) => void; inScope: boolean; iso3: string }) {
  const { T, W, cal, rec, aoi, has, lang } = x;
  const [pickOpen, setPickOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  /* 상황판·출동에서 넘어온 조건(목업 analysis.js handoff — 「가져온 조건」 · 이름(label, 없으면 지역) · approx · 달 · 범위 밖 · 닫기).
     받는 쪽 주소: from=home|ops & aoi & ym & label(넘긴 쪽 이름 — 시군 묶음·그린 영역) & approx(덮는 지원 지역 설명) */
  const sp = useQueryParams();
  const [hoClosed, setHoClosed] = useState(false);
  const hoFrom = sp.get("from");
  const handoff = (hoFrom === "home" || hoFrom === "ops") && !hoClosed;
  const hoLabel = (sp.get("label") ?? "").replace(/[<>]/g, "").slice(0, 80);
  const hoApprox = (sp.get("approx") ?? "").replace(/[<>]/g, "").slice(0, 80);
  const hoAoi = sp.get("aoi");
  const hoOut = !!hoAoi && !(AOI_OK(hoAoi) && has(hoAoi));
  const { list: countries } = useCountry();
  const aq = useQuery(aoisQuery(x.M?.method_version ?? null));
  const cov = coverage(rec?.first_month, rec?.last_month, cal);
  const first = +cov.first_month.slice(0, 4);
  const lastY = +(cov.partial_month ?? cov.last_complete_month).slice(0, 4);
  const y = Math.max(first, Math.min(lastY, yr));
  const sel = x.y === y && selectable(cal, y, x.m) ? x.m : null;
  const blocked = !inScope || !selectable(cal, x.y, x.m);

  const setAoi = (id: string) => {
    const i3 = iso3OfAoi(id);
    x.writeQ({ aoi: id, step: null }, false, i3 && i3 !== iso3 ? i3 : undefined);
  };
  const pickMonth = (mm: number) => x.writeQ({ ym: ymIso(y, mm), step: null });

  /* 지역 단추: 지금 나라 단위 + 지금 고른 다른 지역(한국도 다른 나라와 같다 — 고정 사례 지역 단추 없음). 나라 단위가 목록에 없으면 옛 한국 단추 */
  const own = aoiOfIso3(iso3);
  const ids: string[] = has(own) ? [own] : KOR ? KOR_AOIS.filter(has) : [own];
  if (aoi && aoi !== "WORLD" && !ids.includes(aoi)) ids.push(aoi);
  /* 전 세계(WORLD) — 목록에 행이 있을 때만(실서버 있음 · 목 스냅숏 없음) */
  if (has("WORLD")) ids.push("WORLD");
  const lvW = (a: AoiRec) => (a.level === "kr_sido" || a.level === "adm1" ? T("g5.lv_sido") : a.level === "kr_sgg" ? T("g5.lv_sgg") : "");

  /* 출처 구간 = /methods/current value_sources(시작이 있는 것) — 없으면 캘린더 행의 value_source 를 이어서 */
  const vsrc = (x.M?.value_sources ?? []).filter((g) => g.from);
  const rg = vsrc.length
    ? vsrc.map((g) => ({ vs: g.value_source, from: String(g.from).slice(0, 7), to: g.to ? String(g.to).slice(0, 7) : "", raw: g }))
    : regimes(cal).map((g) => ({ ...g, raw: { value_source: g.vs, from: g.from, to: g.to } }));
  const lastM = cov.partial_month ?? cov.last_complete_month;
  const curVs = monthRec(cal, x.y, x.m)?.value_source ?? null;
  const rows = Array.from({ length: 12 }, (_, i) => monthRec(cal, y, i + 1) ?? { year: y, month: i + 1, status: "out_of_range", data_source: null, value_source: null });
  const allMiss = (cal?.months ?? []).filter((r) => r.status === "missing");
  /* 재생 지도에서 나라를 누르면 그 나라 단위 분석(같은 나라면 그 달만) — 목업 mountWorld onCountry */
  const onCountry = (i3: string, i: number) => {
    const [yy, mm] = ymOfIndex(i);
    setYr(yy);
    if (i3 === iso3) x.writeQ({ ym: ymIso(yy, mm), step: null });
    else x.writeQ({ aoi: i3 === "KOR" ? null : aoiOfIso3(i3), ym: ymIso(yy, mm), step: null }, false, i3);
  };

  return (
    <div className={cx("an-s1")}>
      <div className={cx("an-s1l")}>
        <section className={cx("an-q panel")} aria-label={T("ui.analysis_scope")}>
          {handoff ? (
            <div className={cx("an-handoff")} role="status" data-handoff={hoFrom ?? ""}>
              <div className={cx("an-hot")}>
                <span className={cx("eyebrow")}>{T("ui.conditions_from_overview")}</span>
                <p>
                  <b>{hoLabel || (rec ? (lang === "ko" ? rec.name_ko : nameEn(rec) || rec.name_ko) || aoi : (aoi ?? "–"))}</b>
                  {hoApprox ? ` · ${hoApprox}` : null}
                  {/^\d{4}-\d{2}$/.test(sp.get("ym") ?? "") ? (
                    <>
                      {" · "}
                      <b className={cx("num")}>{sp.get("ym")}</b>
                    </>
                  ) : null}
                  {hoOut ? (
                    <>
                      {" "}
                      <Status st="out_of_range" />
                    </>
                  ) : null}
                </p>
              </div>
              <button type="button" className={cx("iconbtn an-hox")} data-hox="" aria-label={T("ui.close")} onClick={() => setHoClosed(true)}>
                <X aria-hidden="true" strokeWidth={1.9} />
              </button>
            </div>
          ) : null}
          <div className={cx("an-f")}>
            <div className={cx("an-fl")}>
              <b>{T("ui.region")}</b>
            </div>
            <div className={cx("an-fc")}>
              <div className={cx("seg an-aois")} role="group" aria-label={T("ui.region")}>
                {ids.map((id) => {
                  const a = x.has(id) ? (aq.data ?? []).find((q) => q.aoi_id === id) ?? null : null;
                  if (!a)
                    return (
                      <button key={id} type="button" className={cx("an-aoi")} disabled aria-disabled="true" aria-pressed="false">
                        {x.aoiName(null)} <Status st="out_of_range" />
                      </button>
                    );
                  return (
                    <button key={id} type="button" className={cx("an-aoi")} data-aoi={id} aria-pressed={aoi === id} onClick={() => aoi !== id && setAoi(id)}>
                      {x.aoiName(a)}
                      {a.derived ? <span className={cx("an-val")}> {T("g3.sum_sgg")}</span> : a.level === "country" && !KOR ? <span className={cx("an-val")}> {T("g3.country_level")}</span> : lvW(a) && !(KOR_AOIS as readonly string[]).includes(id) ? <span className={cx("an-val")}> {lvW(a)}</span> : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={cx("an-aoi an-aoimore")}
                  data-aoimore=""
                  aria-haspopup="dialog"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setAnchor({ left: r.left, bottom: r.bottom });
                    setPickOpen(true);
                  }}
                >
                  <Search className={cx("ic ic-inline")} aria-hidden="true" />
                  <span>{T("g5.other_region")}</span>
                </button>
              </div>
            </div>
          </div>
          <div className={cx("an-f")}>
            <div className={cx("an-fl")}>
              <b>{T("ui.analysis_month")}</b>
            </div>
            <div className={cx("an-fc")}>
              <div className={cx("an-mrow")}>
                <div className={cx("an-ystep")}>
                  <button type="button" className={cx("iconbtn")} aria-label={T("ui.previous_year")} disabled={y <= first} onClick={() => setYr(y - 1)}>
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <select className={cx("select an-ysel")} aria-label={T("ui.analysis_year")} value={y} onChange={(e) => setYr(+e.target.value)}>
                    {Array.from({ length: lastY - first + 1 }, (_, i) => lastY - i).map((yy) => (
                      <option key={yy} value={yy}>
                        {T("fmt.year", { y: yy })}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={cx("iconbtn")} aria-label={T("ui.next_year")} disabled={y >= lastY} onClick={() => setYr(y + 1)}>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className={cx("an-months")} role="group" aria-label={T("ui.analysis_month")}>
                {Array.from({ length: 12 }, (_, i) => {
                  const mm = i + 1;
                  const r = monthRec(cal, y, mm);
                  const st = r?.status ?? "out_of_range";
                  const ok = selectable(cal, y, mm);
                  const md = r?.missing_dates?.length ? W("st.missing_days_n", { n: r.missing_dates.length }) : "";
                  return (
                    <button
                      key={mm}
                      type="button"
                      className={cx("an-m")}
                      data-m={mm}
                      data-st={st}
                      aria-pressed={ok && sel === mm}
                      disabled={!ok}
                      aria-disabled={!ok || undefined}
                      title={[ymIso(y, mm), W(`st.${st}`), md].filter(Boolean).join(" · ")}
                      onClick={() => pickMonth(mm)}
                    >
                      <StIcon st={st} />
                      <b>{monthWord(lang, mm)}</b>
                      {st !== "ok" && st !== "out_of_range" ? <small>{W(`st.${st}`)}</small> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className={cx("an-check")} aria-live="polite">
            <div className={cx("an-cta")}>
              {x.errWord ? <span className={cx("an-errw")}>{x.errWord}</span> : null}
              <button type="button" className={cx("btn primary an-go")} data-next="" disabled={blocked} onClick={() => x.go(2)}>
                {T("ui.view_analysis")}
              </button>
            </div>
          </div>
        </section>
        <section className={cx("panel an-status")}>
          <div className={cx("panel-h")}>
            <h3>
              {T("g3.data_status")} <span className={cx("num")}>{y}</span>
            </h3>
          </div>
          <div className={cx("panel-b")}>
            <div className={cx("tbl-wrap an-stt")}>
              <table className={cx("tbl")}>
                <thead>
                  <tr>
                    <th>{T("g3.c_month")}</th>
                    <th>{T("g3.c_status")}</th>
                    <th>{T("g3.c_data")}</th>
                    <th className={cx("r")}>{T("g3.c_missing_days")}</th>
                    <th>{T("g3.c_source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.month} data-st={r.status ?? ""} className={cx(KOR && sel === r.month && "is-sel")}>
                      <td className={cx("num")}>{ymIso(r.year, r.month)}</td>
                      <td>
                        <Status st={r.status} ok />
                      </td>
                      <td>{r.data_source ? W(`dsrc.${String(r.data_source).toLowerCase()}`) : "–"}</td>
                      <td className={cx("r num")} title={r.missing_dates?.length ? r.missing_dates.join(", ") : undefined}>
                        {r.status === "out_of_range" || !r.missing_dates ? "–" : r.missing_dates.length}
                      </td>
                      <td className={cx("an-srcw")}>{r.value_source ? W(`vsrc.${r.value_source}`) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allMiss.length ? (
              <details className={cx("an-ev an-mfold")}>
                <summary>
                  <b>
                    {T("ui.missing")}
                    <span className={cx("num")}>{allMiss.length}</span>
                    {T("ui.months")}
                  </b>
                </summary>
                <ul className={cx("an-miss")}>
                  {allMiss.map((r) => (
                    <li key={`${r.year}-${r.month}`}>
                      <i className={cx("miss-sw")} />
                      <span className={cx("num")}>{ymIso(r.year, r.month)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </section>
      </div>
      <aside className={cx("an-side")}>
        <BoundaryPreview
          iso3={aoi === "WORLD" ? "" : (iso3OfAoi(aoi) ?? iso3)}
          info={countries.find((c) => c.iso3 === (iso3OfAoi(aoi) ?? iso3))}
          aoi={aoi}
          rec={rec}
          parent={rec?.parent_id ? ((aq.data ?? []).find((q) => q.aoi_id === rec.parent_id) ?? null) : null}
          lang={lang}
          title={T("ui.boundary_preview")}
          label={T("ui.boundary_preview2", { aoi: x.aoiName(rec), rw: "" })}
          open={x.device === "web"}
        />
        <section className={cx("panel an-span")}>
          <div className={cx("panel-h")}>
            <h3>{T("ui.supported_period")}</h3>
          </div>
          <div className={cx("panel-b")}>
            <div className={cx("an-segdd")}>
              <span className={cx("an-segh")}>
                <span className={cx("num")}>
                  {cov.first_month} – {cov.last_complete_month}
                </span>{" "}
                {T("ui.complete_months")}
              </span>
              {cal ? (
                <Track
                  from={cov.first_month}
                  to={lastM}
                  label={`${T("ui.supported_period2")}${cov.first_month} – ${lastM}`}
                  spans={rg.map((g) => ({ vs: g.vs, from: g.from < cov.first_month ? cov.first_month : g.from, to: !g.to || g.to > lastM ? lastM : g.to, label: W(`vsrc.${g.vs}`) })).filter((g) => g.to >= g.from)}
                  tail={cov.partial_month ? { from: cov.partial_month, label: `${W("st.partial")} · ${cov.as_of ?? ""}` } : null}
                  mark={KOR && inScope ? { k: ymK(ymIso(x.y, x.m)), label: ymIso(x.y, x.m) } : null}
                  ticks={[first, 2012, lastY]}
                />
              ) : null}
              {cal ? (
                <Eras
                  from={ymK(cov.first_month) / 12}
                  to={(ymK(lastM) + 1) / 12}
                  label={W("eras.label")}
                  tip={(sat, ym) => `${sat} · ${W("eras.start", { d: ym })}`}
                />
              ) : null}
              <ul className={cx("an-segl")}>
                {rg.map((g) => (
                  <li key={g.vs + g.from} className={cx(curVs === g.vs && "is-cur")}>
                    <i className={cx("an-segdot", { modis_m2v_terra: "as", modis_m2v: "as", snpp_observed: "va" }[g.vs] ?? "af")} aria-hidden="true" />
                    <span>
                      <b>{W(`vsrc.${g.vs}`)}</b>{" "}
                      <span className={cx("num")}>
                        {g.raw.from} – {g.raw.to ?? ""}
                      </span>
                      {curVs === g.vs ? <em className={cx("an-segcur")}> {T("ui.analysis_month")}</em> : null}
                    </span>
                  </li>
                ))}
                {cov.partial_month ? (
                  <li className={cx("tl")}>
                    <i className={cx("an-segdot tl")} aria-hidden="true" />
                    <span>
                      <b>{W("st.partial")}</b>{" "}
                      <span className={cx("num")}>
                        {cov.partial_month}
                        {cov.as_of ? ` · ~${cov.as_of}` : ""}
                      </span>
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </section>
      </aside>
      <section className={cx("panel an-wd")} aria-label={T("w1.title")} data-wd="">
        <div className={cx("panel-h")}>
          <h3>
            {T("w1.title")} <span className={cx("num")}>1°</span>
          </h3>
        </div>
        <WorldReplay mv={x.M?.method_version ?? null} month={selectable(cal, x.y, x.m) ? monthIndex(x.y, x.m) : null} partialLine={(o) => T("g6.partial", o)} onCountry={onCountry} />
      </section>
      <AoiPicker open={pickOpen} onOpenChange={setPickOpen} anchor={anchor} phone={x.device === "phone"} aois={pickableAois(aq.data ?? [], pickableIso3(countries, aq.data))} countries={countries} current={aoi} onPick={(id) => AOI_OK(id) && id !== "WORLD" && setAoi(id)} />
    </div>
  );
}
