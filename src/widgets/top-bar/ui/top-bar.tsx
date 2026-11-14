"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { useLocale } from "next-intl";
import { useCountry, countryName, clockTz } from "@/entities/country";
import { useSession } from "@/entities/session";
import { useNowMs, useSituation } from "@/entities/situation";
import { AccountDialog } from "@/features/account-menu";
import { AlertBell } from "@/features/alert-drawer";
import { LoginDialog } from "@/features/auth-login";
import { CountryPicker } from "@/features/select-country";
import { LangButton, useSwitchLocale } from "@/features/switch-locale";
import { PAGES, PAGE_IDS, pageHref, tabsFor, type Locale, type PageId } from "@/shared/config";
import { useT, useTl } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { localHM, tzAbbr } from "@/shared/lib/time";
import { useDevice } from "@/shared/lib/use-device";
import { usePref } from "@/shared/lib/use-pref";
import { Icon, LogoMark, iconButtonClass } from "@/shared/ui";
import { useFitLevel } from "../model/use-fit-level";

/**
 * 머리줄 — 목업 core.js renderTop(r8 관제 콘솔)을 그대로 옮긴 것. 모양은 목업 index.html 「셸: 머리줄」 규칙을 토큰 유틸로.
 * ① 위치: 로고 표지 · 탭 무리([캘린더][비교 분석][방법·검증] ¦ [상황판][+역할 탭]) · 나라 칩
 * ② 상황: 위험지수(한국) | 이번 달 배수(다른 나라) · 다음 통과 · 기상(한국) · 연결·시계 — 모든 화면 같은 칸·같은 순서
 * ③ 나: 언어(웹) · 알림(로그인) · 계정 | 로그인(웹) | 사람 메뉴(그 밖 기기)
 * 좁아지면 우선순위 낮은 칸부터 통째로 뺀다(data-tf, model/fit-level.ts). 말줄임 없음.
 *
 * 아직 옮기지 않은 칸(다음 단계): 다음 위성 통과(목업 EM.passes 궤도 계산 → entities/satellite-pass),
 * 다른 나라 「이번 달 배수」 값(목업 생성기 EM.anomalyNow → 실제 API 값으로) — 지금은 「–」.
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
  const nowMs = useNowMs();
  const [clockUTC] = usePref("clockUTC");
  const tz = clockTz(info, { utc: clockUTC === "1", regionChosen: !!sp.get("r"), nowMs: nowMs ?? 0 });
  const KOR = iso3 === "KOR";
  const { go } = useSwitchLocale();

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
        className={cn(
          "relative inline-flex min-w-(--hit) items-center justify-center gap-2 whitespace-nowrap px-3 text-body font-medium text-t2 no-underline transition-[color,background-color] duration-(--dur-fast) ease-em hover:bg-s3 hover:text-t1 focus-visible:-outline-offset-2 [&_svg]:ic-nav",
          "aria-[current=page]:font-strong aria-[current=page]:text-t1 aria-[current=page]:sel-b",
          "phone:w-(--hit) phone:px-0 phone:aria-[current=page]:w-auto phone:aria-[current=page]:gap-1 phone:aria-[current=page]:px-2",
          "phone:tf8:aria-[current=page]:w-(--hit) phone:tf8:aria-[current=page]:px-0",
        )}
      >
        <Icon name={PAGES[id].icon} size="nav" />
        <span className="midsize:hidden phone:hidden">{label}</span>
        <span className={cn("hidden midsize:inline", on && "phone:inline phone:text-fs3 phone:tf8:hidden")}>{t(`shell.nav.${id}.short`)}</span>
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
        className="flex h-(--bar-h) min-w-0 items-center gap-3 gutter-x pt-[env(safe-area-inset-top,0px)] phone:gap-2"
      >
        {/* ① 위치 */}
        <div className="flex min-w-0 flex-none items-center gap-3 self-stretch phone:gap-2">
          <span role="img" aria-label="Emberline" className="inline-flex flex-none items-center gap-2 text-t1 phone:hidden">
            <LogoMark />
            <b aria-hidden="true" className="text-mark leading-none font-strong midsize:hidden">
              Emberline
            </b>
          </span>
          {vr()}
          <nav aria-label={t("shell.top.nav")} className="flex min-w-0 items-stretch gap-1 self-stretch phone:gap-0">
            {tabs.challenge.map(tab)}
            {vr("mx-1")}
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
        <div ref={sitRef} role="group" aria-label={t("shell.top.sit")} className="ml-auto flex min-w-0 flex-[0_1_auto] items-center overflow-hidden">
          {KOR && sit ? (
            <span
              title={tl("risk", "basis", null, sit.risk_index.basis)}
              data-sc="risk"
              className={cn(SC, LV_C[sit.risk_index.level], "rounded-xs bg-[color-mix(in_srgb,var(--c,var(--text-3))_16%,transparent)]")}
            >
              <span className="text-fs2 text-t2 tf5:hidden">
                <span className="phone:hidden">{t("shell.top.risk")}</span>
                <span className="hidden phone:inline">{t("shell.top.risk.short")}</span>
              </span>
              <b className="mono text-stat font-medium leading-none text-t1">{sit.risk_index.value}</b>
              <span className="text-fs3 font-strong text-(--c,var(--text-1)) tf7:hidden">{t(`shell.risk.${sit.risk_index.level}`)}</span>
              <span aria-hidden="true" className="hidden h-1 w-10 overflow-hidden bg-line-strong web:wide:block">
                <i className="block h-full bg-(--c,var(--text-2))" style={{ width: `${sit.risk_index.value}%` }} />
              </span>
            </span>
          ) : !KOR ? (
            <span data-sc="risk" title={t("shell.anom.title")} className={cn(SC, LV_C[1], "rounded-xs bg-[color-mix(in_srgb,var(--c,var(--text-3))_16%,transparent)]")}>
              <span className="text-fs2 text-t2 tf5:hidden">
                <span className="phone:hidden">{t("shell.top.anom")}</span>
                <span className="hidden phone:inline">{t("shell.top.anom.short")}</span>
              </span>
              <b className="mono text-stat font-medium leading-none text-t1">–</b>
              <span className="text-fs3 font-strong text-(--c,var(--text-1)) tf7:hidden">–</span>
            </span>
          ) : null}
          {KOR && sit ? (
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
        </div>
        {vr()}

        {/* ③ 나 */}
        <div className="flex flex-none items-center gap-1 phone:gap-0">
          {web ? <LangButton /> : null}
          {role ? <AlertBell role={role} unread={new Set()} /> : null}
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
        list={list}
        current={iso3}
        recent={recent()}
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
      />
    </header>
  );
}
