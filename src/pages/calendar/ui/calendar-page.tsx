"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, Flame, MapPin, Play } from "lucide-react";
import { countryName, pickableAois, pickableIso3, useCountry } from "@/entities/country";
import { methodQuery } from "@/entities/release";
import { ApiError } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { prefs } from "@/shared/lib/prefs";
import { useDevice } from "@/shared/lib/use-device";
import { aoisQuery, calendarAllQuery, type AoiRec } from "../api/queries";
import {
  topMonths,
  aoiOfIso3,
  bandsOf,
  calInput,
  counts,
  FIRST,
  inRange,
  iso3OfAoi,
  LAST,
  lastMonth,
  MODES,
  monthIndex,
  nameEn,
  srcScope,
  VIEWS,
  ymIso,
  ymOfIndex,
  type CalView,
  type CountKey,
  type Mode,
} from "../model/calendar";
import { AoiPicker } from "./aoi-picker";
import { useRamp } from "./bits";
import { CalDetail } from "./cal-detail";
import { CalGrid } from "./cal-grid";
import { CalMap } from "./cal-map";
import { cx } from "./cx";
import { WorldReplay } from "./world-replay";

/**
 * ① 연소 활동 캘린더(로그인 전 기본 화면) — 원천: 목업 pages/calendar.js · calendar.css · calendar-dots.js · worldgrid.js(g6 확정본).
 * 데이터: 계약 /api/v1 만(aois · calendar · comparison · cells · hotspots · boundary · methods/current) + 정적 world-1deg(전 세계 재생).
 * 구성: H 화면 머리(지역 고르기 · 보기 4 · 모드 2) · K 상태 개수 띠 · C 연×월 캘린더 + value_source 띠 · D 선택 달 상세 · M 그 달 점(원) 지도 · W 전 세계 1° 재생.
 * 주소: ?aoi=<aoi_id>&ym=YYYY-MM&view=…&mode=world|cal (기본값은 주소에 쓰지 않는다 — 사용자가 바꿀 때만).
 * 모드 기본값: 주소에 aoi 가 없으면 전 세계 재생, 있으면 지역 캘린더. 모드 단추를 누르면 mode 를 주소에 적는다.
 */
export function CalendarPage() {
  return (
    <Suspense fallback={<div className="min-h-full" data-slot="page-pending" />}>
      <CalendarScreen />
    </Suspense>
  );
}

const isView = (v: string | null): v is CalView => !!v && (VIEWS as readonly string[]).includes(v);
const isMode = (v: string | null): v is Mode => !!v && (MODES as readonly string[]).includes(v);

function CalendarScreen() {
  const t = useT();
  const lang = useLocale();
  const device = useDevice();
  const router = useRouter();
  const pathname = usePath();
  const sp = useQueryParams();
  const { iso3, list: countries } = useCountry();
  /* 연×월 칸(CalGrid)은 어두운 셸 위 램프. 밝은 지도(점 지도·전 세계 재생)는 지도마다 공통 단계 색(shared/lib/display, 표시 규칙서 R4)을 스스로 읽는다 */
  const ramp = useRamp();
  const mq = useQuery(methodQuery());
  const mv = mq.data?.method_version ?? null;
  const release = (mq.data as { data_version?: string } | undefined)?.data_version ?? mv ?? "";
  const aq = useQuery(aoisQuery(mv));
  const aois = useMemo(() => aq.data ?? [], [aq.data]);
  const byId = useMemo(() => new Map(aois.map((a) => [a.aoi_id, a] as const)), [aois]);

  /* 지역: 주소 aoi(나라 칩과 맞을 때) → 지금 나라 AOI → 전 세계 */
  const urlAoi = sp.get("aoi");
  const aoi = useMemo(() => {
    if (!aq.data) return null;
    if (urlAoi && byId.has(urlAoi)) {
      const i3 = iso3OfAoi(urlAoi);
      if (urlAoi === "WORLD" || !i3 || i3 === iso3) return urlAoi;
    }
    const own = aoiOfIso3(iso3);
    return byId.has(own) ? own : "WORLD";
  }, [aq.data, urlAoi, byId, iso3]);

  const view: CalView = isView(sp.get("view")) ? (sp.get("view") as CalView) : "value";
  /* 첫 화면 = 전 세계 재생(QA 2026-11-15: 세계 캘린더가 먼저 보이고 지역으로 이동). 주소에 지역(aoi)이 있으면 지역 캘린더(다른 화면에서 넘어온 링크) */
  const mode: Mode = isMode(sp.get("mode")) ? (sp.get("mode") as Mode) : sp.get("aoi") ? "cal" : "world";
  const ymQ = /^\d{4}-\d{2}$/.test(sp.get("ym") ?? "") ? (sp.get("ym") as string) : null;
  const [only, setOnly] = useState<CountKey | null>(null);

  const cq = useQuery({ ...calendarAllQuery(aoi ?? "WORLD", mv), enabled: !!mv && !!aoi });
  const cal = cq.data && cq.data.aoi_id === aoi ? cq.data : null;
  const tops = useMemo(() => topMonths(cal), [cal]);
  const [y, m] = useMemo<[number, number]>(() => {
    if (ymQ) {
      const yy = +ymQ.slice(0, 4);
      const mm = +ymQ.slice(5, 7);
      if (inRange(yy, mm)) return [yy, mm];
    }
    return lastMonth(cal);
  }, [ymQ, cal]);

  /* 주소 쓰기(기본값은 지운다). 나라가 바뀌면 c·저장값도 */
  const writeQ = useCallback(
    (patch: Record<string, string | null>, country?: string | null) => {
      const q = new URLSearchParams(sp.toString());
      Object.entries(patch).forEach(([k, v]) => (v == null ? q.delete(k) : q.set(k, v)));
      if (country !== undefined && country !== null) {
        if (country === "KOR") q.delete("c");
        else q.set("c", country);
        q.delete("r");
        prefs.set("country", country);
      }
      const s = q.toString();
      router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
    },
    [sp, router, pathname],
  );
  const setView = (v: CalView) => {
    setOnly(null);
    writeQ({ view: v === "value" ? null : v });
  };
  const setMode = (md: Mode) => writeQ({ mode: md });
  const selectMonth = useCallback(
    (yy: number, mm: number) => {
      if (inRange(yy, mm)) writeQ({ ym: ymIso(yy, mm) });
    },
    [writeQ],
  );
  const setAoi = useCallback(
    (id: string, extra: Record<string, string | null> = {}) => {
      const want = iso3OfAoi(id);
      writeQ({ aoi: id, ...extra }, want && want !== iso3 ? want : undefined);
    },
    [writeQ, iso3],
  );

  const grid = useMemo(() => calInput(cal, view), [cal, view]);
  const n = useMemo(() => counts(cal, view), [cal, view]);
  const bands = useMemo(() => bandsOf(cal, view), [cal, view]);
  const scope = useMemo(() => srcScope(cal), [cal]);

  /* 이름 */
  const aoiName = useCallback(
    (id: string | null) => {
      if (!id || id === "WORLD") return t("calendar.pick.world");
      const a = byId.get(id);
      const i3 = a?.level === "country" ? iso3OfAoi(id) : null;
      if (i3) return countryName(countries.find((c) => c.iso3 === i3), lang, a?.name_ko ?? id);
      if (!a) return id;
      return (lang === "ko" ? a.name_ko : nameEn(a)) || a.name_ko || nameEn(a) || id;
    },
    [byId, countries, lang, t],
  );
  const nameKo = (id: string | null) => {
    const a = id ? byId.get(id) : null;
    return lang !== "ko" && !!a && a.level !== "country" && a.level !== "world" && !nameEn(a) && !!a.name_ko;
  };
  const lvWord = (id: string | null) => {
    const lv = id === "WORLD" ? "world" : (id && byId.get(id)?.level) || "";
    return lv ? t(`calendar.lv.${lv}`) : "";
  };

  /* 지역 고르기 창 */
  const [pickOpen, setPickOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);

  const fail = cq.error ?? aq.error ?? mq.error;
  const failWord = fail ? t(fail instanceof ApiError && fail.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.network") : null;
  const ready = !!cal && !!ramp;
  const phone = device === "phone";
  const pageName = t("shell.page.calendar");

  const cnt = n
    ? (
        [
          ["ok", t("shell.st.ok"), n.ok],
          ["nrt", t("shell.st.nrt"), n.nrt],
          ["partial", t("shell.st.partial"), n.partial],
          ["missing", t("shell.st.missing"), n.missing],
          ...(n.before_sensor ? [["before_sensor", t("shell.st.before_sensor"), n.before_sensor]] : []),
          ...(n.interval_out ? [["interval_out", t("calendar.flag.interval_out"), n.interval_out]] : []),
        ] as [CountKey, string, number][]
      )
    : [];

  return (
    <div className="min-h-full min-w-0" data-page="calendar">
      <div className={cx("cl")} data-mode={mode} data-testid="calendar" data-ready={ready ? "1" : "0"} data-aoi={aoi ?? ""} data-ym={ymIso(y, m)} data-view={view}>
        <header className={cx("pghd")}>
          <div className={cx("ph-1")}>
            <h1>{pageName}</h1>
            <span className={cx("ph-scope")}>
              <span lang={nameKo(aoi) ? "ko" : undefined}>{aoiName(aoi)}</span> · <span className={cx("num")}>{`${ymIso(FIRST[0], FIRST[1])} – ${ymIso(LAST[0], LAST[1])}`}</span>
              {scope ? (
                <span className={cx("cl-src")}>
                  <span className={cx("cl-srci")}>
                    <i className={cx("cl-vsw")} data-b="a" aria-hidden="true" />
                    <span className={cx("num")}>{t("calendar.ui.scope_modis", { a: scope.modisFrom, b: scope.modisTo })}</span>
                  </span>
                  <span className={cx("cl-srci")}>
                    <i className={cx("cl-vsw")} data-b="b" aria-hidden="true" />
                    <span className={cx("num")}>{t("calendar.ui.scope_viirs", { a: scope.viirsFrom })}</span>
                  </span>
                </span>
              ) : null}
            </span>
            <div className={cx("ph-tools")}>
              <button
                type="button"
                className={cx("btn cl-aoi")}
                aria-haspopup="dialog"
                aria-label={`${t("calendar.act.pick")} · ${aoiName(aoi)}`}
                disabled={!aq.data}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setAnchor({ left: r.left, bottom: r.bottom });
                  setPickOpen(true);
                }}
              >
                <MapPin aria-hidden="true" />
                <span className={cx("cl-aoin")} lang={nameKo(aoi) ? "ko" : undefined}>
                  {aoiName(aoi)}
                </span>
                <span className={cx("cl-lv")}>{lvWord(aoi)}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {mode === "cal" ? (
                <div className={cx("seg cl-view")} role="group" aria-label={t("calendar.ui.view")}>
                  {VIEWS.map((v) => (
                    <button key={v} type="button" data-view={v} aria-pressed={view === v} onClick={() => view !== v && setView(v)}>
                      {t(`shell.view.${v}`)}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className={cx("seg cl-mode")} role="group" aria-label={t("calendar.ui.mode")}>
                {MODES.map((md) => (
                  <button key={md} type="button" data-mode={md} aria-pressed={mode === md} onClick={() => mode !== md && setMode(md)}>
                    {md === "cal" ? <CalendarDays aria-hidden="true" /> : <Play aria-hidden="true" />}
                    <span>{t(`calendar.mode.${md}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {mode === "cal" && cnt.length ? (
            <div className={cx("cntbar")} role="group" aria-label={t("shell.counts.aria")}>
              {cnt.map(([k, label, v]) => (
                <button key={k} type="button" className={cx("cb")} data-cnt={k} aria-pressed={only === k} onClick={() => setOnly(only === k ? null : k)}>
                  <span className={cx("cb-k")}>{label}</span>
                  <span className={cx("cb-vw")}>
                    <b className={cx("cb-v")}>{v >= 1000 ? v.toLocaleString(lang) : v}</b>
                    <span className={cx("cb-u")}>{t("calendar.ui.months_u")}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className={cx("cl-body")}>
          {failWord && !cal ? (
            <div className={cx("cl-empty")}>
              <span>{failWord}</span>
            </div>
          ) : !ready || !aoi ? null : mode === "world" ? (
            <section className={cx("panel cl-w")} aria-labelledby="cl-h-w">
              <div className={cx("panel-h")}>
                <h2 id="cl-h-w">{t("calendar.mode.world")}</h2>
                <span className={cx("cl-unit")}>{t("shell.unit.snpp_equiv")}</span>
              </div>
              <div className={cx("cl-wbox")}>
                {ramp != null ? <WorldReplay
                  mv={mv}
                  month={inRange(y, m) ? monthIndex(y, m) : null}
                  partialLine={(o) => t("calendar.ui.partial_line", o)}
                  onCountry={(i3, i) => {
                    const [yy, mm] = ymOfIndex(i);
                    setAoi(aoiOfIso3(i3), { mode: "cal", ym: ymIso(yy, mm) });
                  }}
                /> : null}
              </div>
            </section>
          ) : (
            <div className={cx("cl-grid")}>
              <section className={cx("panel cl-mapp")} aria-labelledby="cl-h-map">
                <div className={cx("panel-h")}>
                  <h2 id="cl-h-map">
                    {t("calendar.ui.map")} <span className={cx("num")}>{ymIso(y, m)}</span>
                  </h2>
                  {tops.length ? (
                    <div className={cx("cl-cases")} role="group" aria-label={t("calendar.dm.cases")}>
                      {tops.map(([cy, cm], i) => (
                        <button
                          key={ymIso(cy, cm)}
                          type="button"
                          className={cx("chip cl-case")}
                          data-case={ymIso(cy, cm)}
                          aria-pressed={y === cy && m === cm}
                          onClick={() => selectMonth(cy, cm)}
                        >
                          <Flame aria-hidden="true" />
                          <span className={cx("num")}>{ymIso(cy, cm)}</span>
                          <span>{t(i === 0 ? "calendar.dm.peak1" : "calendar.dm.peak2")}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className={cx("panel-b")}>
                  {/* key 에 달을 넣지 않는다: 달을 바꿔도 지도를 유지하고 칸·점만 바꾼다(달마다 지도를 새로 만들며 덮개가 번쩍이던 것, LF-1·2) */}
                  {ramp != null ? <CalMap key={`${aoi}|${view}`} aoi={aoi} aois={aois} y={y} m={m} view={view} mv={mv} inGb={inGb(aoi, byId)} onCountry={(i3, i) => {
                    const [yy, mm] = ymOfIndex(i);
                    setAoi(aoiOfIso3(i3), { ym: ymIso(yy, mm) });
                  }} onWorldMonth={(i) => {
                    const [yy, mm] = ymOfIndex(i);
                    if (yy !== y || mm !== m) selectMonth(yy, mm);
                  }} /> : null}
                </div>
              </section>
              <CalGrid
                cal={cal}
                aoi={aoi}
                aoiName={aoiName(aoi)}
                release={release}
                view={view}
                grid={grid}
                bands={bands}
                y={y}
                m={m}
                only={only}
                ramp={ramp}
                phone={device !== "web"}
                onPick={selectMonth}
              />
              <CalDetail cal={cal} aoi={aoi} view={view} y={y} m={m} mv={mv} onPick={selectMonth} touch={device !== "web"} />
            </div>
          )}
        </div>
      </div>
      <AoiPicker open={pickOpen} onOpenChange={setPickOpen} anchor={anchor} phone={phone} aois={pickableAois(aois, pickableIso3(countries, aq.data))} countries={countries} current={aoi ?? "WORLD"} onPick={(id) => setAoi(id)} />
    </div>
  );
}

/** 경북(SIDO_47) 안 지역: 전국 · 경북 · 경북 북부 묶음 · 경북 시군구 — 사례 점(의성·울진)이 있는 범위 */
function inGb(id: string | null, byId: Map<string, AoiRec>) {
  if (id === "KR" || id === "SIDO_47" || id === "group:gb-north") return true;
  const a = id ? byId.get(id) : null;
  return !!a && /^SGG_/.test(id ?? "") && a.parent_id === "SIDO_47";
}

