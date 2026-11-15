"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { useLocale } from "next-intl";
import { useCountry, countryName, clockTz, pickableIso3 } from "@/entities/country";
import { useSession } from "@/entities/session";
import { useClockMs, useSituation } from "@/entities/situation";
import { methodQuery } from "@/entities/release";
import { calendarQuery } from "@/entities/month-value";
import { FWI_REL_LEVEL, fwiQuery, hasFwi, mdOf } from "@/entities/fire-weather";
import { nextPass } from "@/entities/satellite-pass";
import { AccountDialog } from "@/features/account-menu";
import { AlertBell, AlertToaster } from "@/features/alert-drawer";
import { LoginDialog } from "@/features/auth-login";
import { aoiIndexQuery } from "@/features/pick-aoi";
import { CountryPicker } from "@/features/select-country";
import { LangButton, useSwitchLocale } from "@/features/switch-locale";
import { PAGE_IDS, ROLE_DEF, pageHref, tabsFor, type Locale, type PageId } from "@/shared/config";
import { useT, useTl } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { aoiOfIso3 } from "@/shared/lib/adm0";
import { localHM, tzAbbr } from "@/shared/lib/time";
import { useDevice } from "@/shared/lib/use-device";
import { usePref } from "@/shared/lib/use-pref";
import { Icon, LogoMark, iconButtonClass } from "@/shared/ui";
import { useFitLevel } from "../model/use-fit-level";

/**
 * 머리줄 — 목업 core.js renderTop(r8 관제 콘솔)을 그대로 옮긴 것. 모양은 목업 index.html 「셸: 머리줄」 규칙을 토큰 유틸로.
 * ① 위치: 로고 표지 · 탭 무리([캘린더][비교 분석][방법·검증] ¦ 로그인 뒤 [상황판][역할 탭]) · 나라 칩
 *    로그인 전에는 뒤 무리가 비므로 가운데 구분선도 그리지 않는다(결정 F12).
 * ② 상황: 산불 기상 위험도 FWI(기관 역할 · 한국·아르헨티나, release v1.2) | 이번 달 배수(그 밖) · 다음 통과 · 기상(한국) · 연결·시계 — 모든 화면 같은 칸·같은 순서
 * ③ 나: 언어(웹) · 알림(로그인) · 계정 | 로그인(웹) | 사람 메뉴(그 밖 기기)
 * 좁아지면 우선순위 낮은 칸부터 통째로 뺀다(data-tf, model/fit-level.ts). 말줄임 없음.
 * 폰은 두 줄(목업 g5 · CALENDAR-PIVOT §3.3): 줄 1 = 나라 · 상황 · 나, 줄 2(--strip-h) = 탭. ① 묶음은 폰에서 display:contents 로 풀린다.
 * 상황 구역은 폰에서 기준 폭 0 — 줄 1 이 넘쳐도 줄바꿈 대신 넘침 단계가 칸을 뺀다.
 *
 * 다음 위성 통과 = entities/satellite-pass(목업 EM.passes 궤도 계산, 기준점 = 나라 표시 중심 — 전 지역).
 * 자료 판·자료 상태(목업 g5 relChipsHTML) = 실제 API(/methods/current · 지금 나라 AOI 의 올해 /calendar 마지막 달). 누르면 방법·검증.
 * 다른 나라 「최근 달」 배수 = 같은 /calendar 의 최근 완결 달(정상·NRT) ratio_to_median·verdict(목업 anomChipHTML).
 * 기상 칸은 시나리오 값(목)이라 로그인 뒤에만 보인다 — 공개 실제 데이터 화면에 경북 시나리오 기상을 섞지 않는다.
 */

/** 단계 색(목업 lvColor: 4 단계만 -ink) — Tailwind 가 볼 수 있게 글자 그대로 둔다 */
const LV_C = {
  1: "[--c:var(--alert-1)]",
  2: "[--c:var(--alert-2)]",
  3: "[--c:var(--alert-3)]",
  4: "[--c:var(--alert-4-ink)]",
} as const;

/** 상황 칸 공통(.sc): 이름표 fs-2 text-2 + 값 mono fs-stat. 칸 사이 머리카락 선, 첫 칸은 선 없음 */
const SC = "inline-flex h-(--sp-6) flex-none items-center gap-2 whitespace-nowrap border-l border-line-soft px-3 text-fs2 text-t2 first:border-l-0 phone:px-2";
const SC_V_DIM = "mono text-stat font-regular leading-none text-t2";
/** 자료 칩(목업 .sc-rel): 누르는 칸 — 배경 투명, hover s3, 터치 덮개 */
const SC_REL = "relative cursor-pointer bg-transparent no-underline transition-[background-color] duration-(--dur-fast) ease-em hover:bg-s3 hit-after";
/** 자료 상태 낱말 색(목업 .sc-st[data-st]) — Tailwind 가 볼 수 있게 글자 그대로 */
const ST_C: Record<string, string> = {
  partial: "text-(--st-partial)",
  nrt: "text-(--st-nrt)",
  missing: "text-(--st-missing-ink)",
};
const VD_LV: Record<string, 1 | 2 | 3 | 4> = { above: 3, similar: 2, below: 1, uncertain: 2 };
/** 나라 색인이 오기 전 한국 기준점(표시 중심 근처) */
const KOR_C: [number, number] = [36.5, 127.9];

function pageOf(pathname: string): PageId | null {
  const seg = pathname.split("/").filter(Boolean)[1];
  return (PAGE_IDS as readonly string[]).includes(seg ?? "") ? (seg as PageId) : null;
}

export function TopBar() {
  const t = useT();
  const tl = useTl();
  const locale = useLocale() as Locale;
  const pathname = usePath();
  const sp = useQueryParams();
  const device = useDevice();
  const web = device === "web";
  const cur = pageOf(pathname);
  const { data: session } = useSession();
  const role = session?.role ?? null;
  const { iso3, info, list, busy, setCountry, recent } = useCountry();
  const { data: sit } = useSituation();
  const nowMs = useClockMs(cur === "ops" && iso3 === "KOR");
  const [clockUTC] = usePref("clockUTC");
  const tz = clockTz(info, { utc: clockUTC === "1", regionChosen: !!sp.get("r"), nowMs: nowMs ?? 0 });
  const KOR = iso3 === "KOR";
  const { go } = useSwitchLocale();

  // 자료 판·자료 상태·최근 달 배수 — release 값만(시나리오 값과 섞지 않는다)
  const { data: meth } = useQuery(methodQuery());
  const mv = meth?.method_version ?? null;
  const dv = meth?.data_version ? (meth.data_version.split("#")[0] ?? null) : null;
  const verShort = dv && dv.indexOf("-") > 0 ? (dv.split("-")[0] ?? "–") : "–";
  const relAoi = aoiOfIso3(iso3);
  /* 나라 칩 목록: release 에 자료 있는 나라 행이 없는 나라(투발루 등)는 뺀다 */
  const { data: aoiIdx } = useQuery(aoiIndexQuery(mv));
  const pick = useMemo(() => pickableIso3(list, aoiIdx), [list, aoiIdx]);
  const pickList = useMemo(() => (pick ? list.filter((c) => pick.has(c.iso3)) : list), [list, pick]);
  const yr = nowMs != null ? new Date(nowMs).getUTCFullYear() : null;
  const { data: cal } = useQuery({ ...calendarQuery(relAoi, { start_year: yr ?? 0, end_year: yr ?? 0 }, mv), enabled: !!mv && yr != null });
  const months = cal && typeof cal === "object" ? cal.months : [];
  const lastM = months.filter((m) => m.status && m.status !== "out_of_range").pop();
  const relYm = lastM ? `${lastM.year}-${String(lastM.month).padStart(2, "0")}` : null;
  const relSt = lastM?.status ?? null;
  const doneM = months.filter((m) => (m.status === "ok" || m.status === "nrt") && m.value != null && m.ratio_to_median != null).pop();
  const anomLv = doneM?.verdict ? (VD_LV[doneM.verdict] ?? 2) : 2;
  const anomYm = doneM ? `${doneM.year}-${String(doneM.month).padStart(2, "0")}` : "–";

  // 산불 기상 위험도 FWI(release fwi_aoi_day, 결정 F15) — 기관 역할 · 한국·아르헨티나만. 마지막 자료일(약 4일 늦음)을 함께 쓴다
  const fwiAoi = role && hasFwi(iso3) ? aoiOfIso3(iso3) : null;
  const { data: fwi } = useQuery(fwiQuery(fwiAoi, mv));
  const fwiDay = fwi?.coverage.available ? fwi.day : null;
  const fwiLv = fwiDay?.fwi_rel_class ? FWI_REL_LEVEL[fwiDay.fwi_rel_class] : null;
  const fwiMd = mdOf(fwi?.as_of_date);
  const fwiAsOf = fwiMd ? t("shell.fwi.asof", { m: fwiMd.m, d: fwiMd.d }) : "–";

  // 다음 위성 통과 — 분이 바뀔 때만 다시 센다
  const nowMin = nowMs != null ? Math.floor(nowMs / 60000) : null;
  const atLat = info ? info.c[1] : KOR_C[0];
  const atLon = info ? info.c[0] : KOR_C[1];
  const nx = useMemo(() => (nowMin == null ? null : nextPass(nowMin * 60000, [atLat, atLon])), [nowMin, atLat, atLon]);
  const nxLeft = nx && nowMs != null ? Math.max(0, Math.round((nx.ms - nowMs) / 60000)) : 0;

  const [pickOpen, setPickOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<{ left: number; bottom: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const sitRef = useRef<HTMLDivElement>(null);
  useFitLevel(topRef, sitRef);

  // 다른 화면으로 갈 때 전역 키(c·r)만 따라간다(목업 EM.go)
  const keep = new URLSearchParams();
  for (const k of ["c", "r"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const tabs = tabsFor(role);

  // 새 역할 탭 반짝(목업 EM._freshNav · .ttab.fresh): 로그인·역할 바꾸기로 역할 탭이 새로 생기거나 바뀌면 그 탭 배경이 두 번 깜박인다.
  // 처음 그릴 때(저장된 세션을 읽어 온 것)는 반짝이지 않는다
  const navPage = role ? ROLE_DEF[role].nav : null;
  const prevNav = useRef<PageId | null | undefined>(undefined);
  const [freshTab, setFreshTab] = useState<PageId | null>(null);
  const loaded = session !== undefined;
  useEffect(() => {
    if (!loaded) return;
    const prev = prevNav.current;
    prevNav.current = navPage;
    if (prev === undefined || !navPage || prev === navPage) return;
    setFreshTab(navPage);
    const tm = setTimeout(() => setFreshTab(null), 2300);
    return () => clearTimeout(tm);
  }, [loaded, navPage]);
  const name = countryName(info, locale, iso3);
  const code = locale === "en";
  const short = code ? iso3 : tl("cshort", iso3, null, name);
  const two = code || short !== name;

  const tab = (id: PageId) => {
    const on = cur === id;
    const label = t(`shell.nav.${id}.label`);
    return (
      <Link
        key={id}
        href={pageHref(locale, id, keep.toString())}
        aria-current={on ? "page" : undefined}
        aria-label={label}
        data-tab={id}
        data-fresh={freshTab === id ? "" : undefined}
        className={cn(
          freshTab === id && "animate-[navIn_1.1s_var(--ease-out)_2]",
          "relative inline-flex min-w-(--hit) items-center justify-center gap-2 whitespace-nowrap px-3 text-body font-medium text-t2 no-underline transition-[color,background-color] duration-(--dur-fast) ease-em hover:bg-s3 hover:text-t1 focus-visible:-outline-offset-2 [&_svg]:ic-nav",
          "aria-[current=page]:font-strong aria-[current=page]:text-t1 aria-[current=page]:sel-b",
          /* 메뉴 아이콘 없음(프런트 UI/UX 2026-11-15) — 폰에서도 짧은 이름 글자로 */
          "phone:px-2",
        )}
      >
        <span className="midsize:hidden phone:hidden">{label}</span>
        <span className="hidden midsize:inline phone:inline phone:text-fs3">{t(`shell.nav.${id}.short`)}</span>
      </Link>
    );
  };
  const vr = (extra?: string) => <span aria-hidden="true" className={cn("h-[calc((var(--bar-h)-env(safe-area-inset-top,0px))/2)] w-px flex-none self-center bg-line-soft phone:hidden", extra)} />;

  return (
    <header className="flex min-w-0 flex-col border-b border-line-soft bg-s2" data-slot="shellhead">
      <div
        ref={topRef}
        id="topbar"
        data-tf="0"
        data-page={cur ?? undefined}
        className="flex h-(--bar-h) min-w-0 items-center gap-3 gutter-x pt-[env(safe-area-inset-top,0px)] phone:h-(--top) phone:flex-wrap phone:content-start phone:gap-x-2 phone:gap-y-0"
      >
        {/* ① 위치 */}
        <div className="flex min-w-0 flex-none items-center gap-3 self-stretch phone:contents">
          <span role="img" aria-label="Emberline" className="inline-flex flex-none items-center gap-2 text-t1 phone:hidden">
            <LogoMark />
            <b aria-hidden="true" className="text-mark leading-none font-strong midsize:hidden">
              Emberline
            </b>
          </span>
          {vr()}
          <nav
            aria-label={t("shell.top.nav")}
            className="flex min-w-0 items-stretch gap-1 self-stretch phone:order-10 phone:h-(--strip-h) phone:flex-[0_0_100%] phone:gap-0 phone:border-t phone:border-line-soft"
          >
            {tabs.challenge.map(tab)}
            {tabs.console.length ? vr("mx-1") : null}
            {tabs.console.map(tab)}
          </nav>
          {vr()}
          <button
            type="button"
            id="ctryBtn"
            aria-haspopup="dialog"
            aria-label={t("shell.country.aria", { name })}
            title={name}
            aria-busy={busy || undefined}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAnchorRect({ left: r.left, bottom: r.bottom });
              setPickOpen((v) => !v);
            }}
            className={cn(
              "group/ctry relative inline-flex h-(--bar-btn) min-w-(--hit) flex-none items-center gap-2 whitespace-nowrap rounded-sm border-0 bg-transparent px-2 text-fs3 font-medium text-t1 transition-[background-color] duration-(--dur-fast) ease-em hover:bg-s3 hit-after",
              "phone:order-first phone:w-auto phone:justify-center phone:gap-0.5 phone:px-1",
            )}
          >
            <span
              className={cn(
                "group-aria-busy/ctry:text-t3",
                code ? "mono font-strong" : "font-sans",
                !code && two && "web:ge1280:not-tf2:hidden",
              )}
            >
              {short}
            </span>
            {two ? (
              <span
                className={cn(
                  "group-aria-busy/ctry:text-t3 web:narrow-web:hidden midsize:hidden phone:hidden tf2:hidden",
                  code ? "font-regular text-t2" : "font-medium text-t1",
                )}
              >
                {name}
              </span>
            ) : null}
            <Icon name="chevD" size="inline" className="text-t2" />
          </button>
        </div>

        {/* ② 상황 */}
        <div ref={sitRef} role="group" aria-label={t("shell.top.sit")} className="ml-auto flex min-w-0 flex-[0_1_auto] items-center overflow-hidden phone:h-[calc(var(--bar-h)-env(safe-area-inset-top,0px))] phone:flex-[1_1_0] phone:justify-end">
          {/* 위험 칸(결정 F15): 기관 역할 안 · 한국·아르헨티나 = 실제 산불 기상 위험도 FWI(상대 등급 기본 + 기준 날짜). 예전 목 「위험 지수」를 대신한다.
              그 밖 나라·공개 화면 = 나라와 같은 release 「최근 달」 배수 */}
          {fwiAoi ? (
            <span
              title={fwiDay ? t("shell.fwi.title", { v: fwiDay.fwi_mean != null ? fwiDay.fwi_mean.toFixed(1) : "–", rel: fwiDay.fwi_rel_class ? t(`shell.fwi.rel.${fwiDay.fwi_rel_class}`) : "–", abs: fwiDay.fwi_class ? t(`shell.fwi.abs.${fwiDay.fwi_class}`) : "–", d: fwiAsOf }) : t("shell.fwi.label")}
              data-sc="risk"
              data-fwi={fwiDay?.fwi_rel_class ?? (fwi && !fwi.coverage.available ? "none" : "")}
              className={cn(SC, fwiLv ? LV_C[fwiLv] : null, "rounded-xs bg-[color-mix(in_srgb,var(--c,var(--text-3))_16%,transparent)]")}
            >
              <span className="text-fs2 text-t2 tf5:hidden">
                <span className="phone:hidden">{t("shell.fwi.label")}</span>
                <span className="hidden phone:inline">{t("shell.fwi.short")}</span>
              </span>
              {fwi && !fwi.coverage.available ? (
                <span className="text-fs2 text-t2">{t("shell.fwi.none")}</span>
              ) : (
                <>
                  <b className="mono text-stat font-medium leading-none text-t1">{fwiDay?.fwi_mean != null ? fwiDay.fwi_mean.toFixed(1) : "–"}</b>
                  <span className="text-fs3 font-strong text-(--c,var(--text-1)) tf7:hidden">{fwiDay?.fwi_rel_class ? t(`shell.fwi.rel.${fwiDay.fwi_rel_class}`) : "–"}</span>
                  <span className="mono text-fs2 text-t2 tf3:hidden phone:hidden" data-fwi-asof="">
                    {fwiAsOf}
                  </span>
                </>
              )}
            </span>
          ) : (
            <span data-sc="risk" title={t("shell.anom.title", { ym: anomYm })} className={cn(SC, LV_C[anomLv], "rounded-xs bg-[color-mix(in_srgb,var(--c,var(--text-3))_16%,transparent)]")}>
              <span className="text-fs2 text-t2 tf5:hidden">
                <span className="phone:hidden">{t("shell.top.anom")}</span>
                <span className="hidden phone:inline">{t("shell.top.anom.short")}</span>
              </span>
              <b className="mono text-stat font-medium leading-none text-t1">{doneM?.ratio_to_median != null ? `${doneM.ratio_to_median.toFixed(1)}×` : "–"}</b>
              <span className="text-fs3 font-strong text-(--c,var(--text-1)) tf7:hidden">{doneM?.verdict ? t(`shell.verdict.${doneM.verdict}`) : "–"}</span>
            </span>
          )}
          {nx ? (
            <span
              data-sc="pass"
              title={t("shell.pass.title", { sat: `${nx.sat} ${nx.sensor}`, t: localHM(nx.ms, tz) })}
              className={cn(SC, "midsize:hidden phone:hidden tf4:hidden [.rounded-xs+&]:border-l-0")}
            >
              <span className="text-fs2 text-t2">{t("shell.top.next")}</span>
              <b className={SC_V_DIM} data-pass>
                {nx.sat} {localHM(nx.ms, tz)}
              </b>
              <span className="mono text-fs2 text-t2 tf3:hidden" data-left>
                ({t("shell.dur.m", { n: nxLeft })})
              </span>
            </span>
          ) : null}
          {KOR && sit && role ? (
            <span data-sc="wx" className={cn(SC, "web:narrow-web:hidden midsize:hidden phone:hidden tf1:hidden [.rounded-xs+&]:border-l-0")}>
              <span className="text-fs2 text-t2">{tl("weather", "station", null, sit.weather.station)}</span>
              <b className={SC_V_DIM}>
                {sit.weather.temp_c}
                <small className="ml-(--sp-half) font-sans text-fs2 font-regular text-t2">℃</small>
              </b>
              <span className="text-fs2 text-t2">{t("shell.top.rh")}</span>
              <b className={SC_V_DIM}>
                {sit.weather.effective_rh}
                <small className="ml-(--sp-half) font-sans text-fs2 font-regular text-t2">%</small>
              </b>
              <span className="hidden font-sans text-fs2 text-t2 web:wide:inline">{tl("weather", "wind", null, sit.weather.wind)}</span>
            </span>
          ) : null}
          {nowMs != null ? (
            <span
              data-sc="conn"
              title={t("shell.top.live_title")}
              className={cn(SC, "midsize:hidden phone:tf2:hidden [.rounded-xs+&]:border-l-0")}
            >
              <i aria-hidden="true" className="size-2 flex-none rounded-full bg-ok" />
              <span className="sr-only">{t("shell.top.live")}</span>
              <b className={cn(SC_V_DIM, "tf6:hidden")}>{localHM(nowMs, tz)}</b>
              <span className="font-sans text-fs2 text-t2 tf6:hidden phone:hidden">{tzAbbr(tz, nowMs)}</span>
            </span>
          ) : null}
          <Link
            href={pageHref(locale, "method", keep.toString())}
            data-sc="ver"
            title={t("shell.top.version_t", { v: meth?.data_version ?? "–" })}
            className={cn(SC, SC_REL, "phone:hidden tf5:hidden")}
          >
            <span className="text-fs2 text-t2">{t("shell.top.version")}</span>
            <b className={cn(SC_V_DIM, "text-t1")}>
              <span className="tf2:hidden">{dv ?? "–"}</span>
              <span className="hidden tf2:inline">{verShort}</span>
            </b>
          </Link>
          <Link
            href={pageHref(locale, "method", [keep.toString(), "sec=status"].filter(Boolean).join("&"))}
            data-sc="st"
            data-st={relSt ?? ""}
            aria-label={`${t("shell.top.status")} · ${relYm ?? "–"} ${relSt ? t(`shell.st.${relSt}`) : "–"}`}
            title={relSt ? t(`shell.st_t.${relSt}`) : t("shell.top.status")}
            className={cn(SC, SC_REL, "phone:min-w-(--hit) phone:justify-center tf7:hidden")}
          >
            <span className="text-fs2 text-t2 phone:hidden">{t("shell.top.status")}</span>
            {relSt ? (
              <span aria-hidden="true" className={cn("size-2 flex-none rounded-full", relSt === "ok" ? "bg-ok" : cn("border border-current", ST_C[relSt] ?? "text-t2"))} />
            ) : null}
            <b className={cn(SC_V_DIM, "text-t1 phone:hidden")}>{relYm ?? "–"}</b>
            <span className={cn("text-fs2 font-medium phone:hidden tf4:hidden", ST_C[relSt ?? ""] ?? "text-t2")}>{relSt ? t(`shell.st.${relSt}`) : "–"}</span>
          </Link>
        </div>
        {vr()}

        {/* ③ 나 */}
        <div className="flex flex-none items-center gap-1 phone:gap-0">
          {web ? <LangButton /> : null}
          {role ? <AlertBell role={role} iso3={iso3} /> : null}
          <AlertToaster role={role} />
          {role ? (
            <button
              type="button"
              id="who"
              aria-haspopup="dialog"
              aria-label={t("shell.who.aria", { role: t(`shell.role.${role}.label`) })}
              onClick={() => setWhoOpen(true)}
              className="relative inline-flex h-(--bar-btn) min-w-(--bar-btn) items-center justify-center gap-1 whitespace-nowrap rounded-sm border-0 bg-transparent px-2 text-fs3 font-medium text-t1 transition-[background-color] duration-(--dur-fast) ease-em hover:bg-s3 hit-after [&_svg]:ic-nav"
            >
              <Icon name="user" size="nav" />
              <span className="midsize:hidden phone:hidden">{t(`shell.role.${role}.short`)}</span>
              <Icon name="chevD" size="inline" className="text-t2 phone:hidden" />
            </button>
          ) : web ? (
            <button
              type="button"
              id="loginBtn"
              onClick={() => setLoginOpen(true)}
              className="relative inline-flex h-(--bar-btn) items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent bg-s3 px-3 text-fs3 font-medium text-t1 transition-[background-color] duration-(--dur-fast) ease-em hover:bg-line-soft hit-after"
            >
              {t("shell.login")}
            </button>
          ) : (
            <button type="button" id="who" aria-haspopup="dialog" aria-label={t("shell.person.aria")} onClick={() => setWhoOpen(true)} className={iconButtonClass}>
              <Icon name="user" size="nav" />
            </button>
          )}
        </div>
      </div>

      <CountryPicker
        open={pickOpen}
        onOpenChange={setPickOpen}
        anchorRect={anchorRect}
        device={device}
        list={pickList}
        current={iso3}
        recent={recent().filter((c) => !pick || pick.has(c.iso3))}
        onPick={(c) => void setCountry(c)}
      />
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <AccountDialog
        open={whoOpen}
        onOpenChange={setWhoOpen}
        country={info}
        nowMs={nowMs}
        tz={tz}
        onLogin={() => setLoginOpen(true)}
        onSwitchLang={go}
        pass={nx}
        anom={doneM ? { ratio: doneM.ratio_to_median ?? null, verdict: doneM.verdict ?? null, ym: anomYm } : null}
        fwi={fwiAoi ? { value: fwiDay?.fwi_mean ?? null, rel: fwiDay?.fwi_rel_class ?? null, abs: fwiDay?.fwi_class ?? null, asOf: fwiAsOf, none: !!fwi && !fwi.coverage.available } : null}
      />
    </header>
  );
}
