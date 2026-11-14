"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";
import { countryName, type CountryInfo } from "@/entities/country";
import { RoleCard, RoleGrid, useLogout, useSession, useSwitchRole } from "@/entities/session";
import { useSituation } from "@/entities/situation";
import { DEFAULT_PAGE, ROLE_DEF, ROLE_IDS, pageHref, type Locale } from "@/shared/config";
import { LANGS, useT, useTl } from "@/shared/i18n";
import { localHM, tzAbbr } from "@/shared/lib/time";
import { usePref } from "@/shared/lib/use-pref";
import { Button, Icon } from "@/shared/ui";
import { Dialog } from "@/shared/ui/dialog";

/**
 * 계정 메뉴 — 목업 openWho 그대로: 역할 · 나라 · 위험지수(한국) · 기상(한국) · 시각(현지 · UTC) · 언어 · 시각 표시 · 역할 바꾸기 · 로그아웃.
 * 비로그인(웹 밖 기기)에서는 같은 창이 「설정」: 언어 · 시각 + [로그인].
 * 다음 위성 통과·다른 나라 「최근 달」 배수는 머리줄이 센 값을 그대로 받는다(머리줄 칸과 같은 값 — 목업 g5 수리).
 */
export function AccountDialog({
  open,
  onOpenChange,
  country,
  nowMs,
  tz,
  onLogin,
  onSwitchLang,
  pass,
  anom,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  country: CountryInfo | undefined;
  nowMs: number | null;
  tz: string;
  onLogin: () => void;
  /** 언어 바꾸기(같은 경로·쿼리의 다른 접두사) — 위젯이 features/switch-locale 로 넘겨 준다(같은 층 가로 import 금지) */
  onSwitchLang: (l: Locale) => void;
  /** 다음 위성 통과(머리줄과 같은 값) */
  pass?: { sat: string; ms: number } | null;
  /** 다른 나라: 최근 완결 달 배수·판정·달(머리줄 칸과 같은 release 값) */
  anom?: { ratio: number | null; verdict: string | null; ym: string } | null;
}) {
  const t = useT();
  const tl = useTl();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { data: session } = useSession();
  const { data: sit } = useSituation();
  const switchRole = useSwitchRole();
  const logout = useLogout();
  const [clockUTC, setClockUTC] = usePref("clockUTC");
  const role = session?.role ?? null;
  const KOR = (country?.iso3 ?? "KOR") === "KOR";
  const fact = (k: string, v: ReactNode) => (
    <>
      <dt className="text-fs2 text-t2">{k}</dt>
      <dd className="m-0 text-fs3">{v}</dd>
    </>
  );
  const seg = (name: string, items: [string, string, string?][], cur: string, onPick: (id: string) => void) => (
    <div role="group" aria-label={name} className="inline-flex min-w-0 overflow-hidden rounded-xs bg-s0 outline-1 -outline-offset-1 outline-line-strong">
      {items.map(([id, label, lang]) => (
        <button
          key={id}
          type="button"
          lang={lang}
          aria-pressed={id === cur}
          onClick={() => onPick(id)}
          className="ctl min-w-(--hit) whitespace-nowrap border-0 bg-transparent px-3 text-fs2 text-t2 transition-[background-color,color] duration-(--dur-fast) ease-em not-first:border-l not-first:border-line-strong aria-pressed:bg-s3 aria-pressed:text-t1 aria-pressed:sel-b focus-visible:-outline-offset-2"
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(role ? "shell.who.title" : "shell.person.title")}
      closeLabel={t("shell.act.close")}
      footer={
        role ? (
          <Button
            raised
            onClick={async () => {
              await logout.mutateAsync();
              onOpenChange(false);
              router.push(pageHref(locale, DEFAULT_PAGE));
            }}
          >
            <Icon name="logout" />
            {t("shell.logout")}
          </Button>
        ) : (
          <Button
            kind="primary"
            onClick={() => {
              onOpenChange(false);
              setTimeout(onLogin, 0);
            }}
          >
            <Icon name="login" />
            {t("shell.login")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2">
          {role ? fact(t("shell.who.role"), t(`shell.role.${role}.label`)) : null}
          {fact(
            t("shell.country.label"),
            <>
              {locale === "en" ? <span className="mono">{country?.iso3 ?? "KOR"} </span> : null}
              {countryName(country, locale, "KOR")}
            </>,
          )}
          {KOR && sit
            ? fact(
                t("shell.top.risk"),
                <>
                  <span className="mono">{sit.risk_index.value}</span> {t(`shell.risk.${sit.risk_index.level}`)}
                </>,
              )
            : null}
          {!KOR
            ? fact(
                t("shell.top.anom"),
                <>
                  <span className="mono">{anom?.ratio != null ? `${anom.ratio.toFixed(1)}×` : "–"}</span> {anom?.verdict ? `${t(`shell.verdict.${anom.verdict}`)} · ${anom.ym}` : ""}
                </>,
              )
            : null}
          {pass ? fact(t("shell.top.next"), <span className="mono" data-who-pass="">{`${pass.sat} ${localHM(pass.ms, tz)}`}</span>) : null}
          {KOR && sit
            ? fact(t("shell.who.wx"), t("shell.who.wx_v", { st: tl("weather", "station", null, sit.weather.station), t: sit.weather.temp_c, rh: sit.weather.effective_rh, wind: tl("weather", "wind", null, sit.weather.wind) }))
            : null}
          {nowMs != null
            ? fact(
                t("shell.who.time"),
                <>
                  {tz === "UTC" && clockUTC !== "1" ? null : (
                    <>
                      <span className="mono">{localHM(nowMs, tz)}</span> {tzAbbr(tz, nowMs)} ·{" "}
                    </>
                  )}
                  <span className="mono">{localHM(nowMs, "UTC")}</span> UTC
                </>,
              )
            : null}
        </dl>
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-fs2 text-t2">{t("shell.lang.label")}</span>
            {seg(
              t("shell.lang.label"),
              LANGS.map((l) => [l.id, l.name, l.id] as [string, string, string]),
              locale,
              (id) => {
                onOpenChange(false);
                onSwitchLang(id as Locale);
              },
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-fs2 text-t2">{t("shell.who.clock")}</span>
            {seg(
              t("shell.who.clock"),
              [
                ["local", t("shell.who.clock_local")],
                ["utc", "UTC"],
              ],
              clockUTC === "1" ? "utc" : "local",
              (id) => setClockUTC(id === "utc" ? "1" : null),
            )}
          </div>
        </div>
        {role ? (
          <>
            <h3 className="text-fs3 font-strong">{t("shell.who.switch")}</h3>
            <RoleGrid>
              {ROLE_IDS.map((r) => (
                <RoleCard
                  key={r}
                  icon={ROLE_DEF[r].icon}
                  label={t(`shell.role.${r}.label`)}
                  desc={t(`shell.nav.${ROLE_DEF[r].nav}.label`)}
                  pressed={r === role}
                  onClick={async () => {
                    await switchRole.mutateAsync(r);
                    onOpenChange(false);
                    router.push(pageHref(locale, ROLE_DEF[r].home));
                  }}
                />
              ))}
            </RoleGrid>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
