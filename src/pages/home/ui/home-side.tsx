"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Alert, Fire } from "@/shared/agency";
import { pageHref, type Locale } from "@/shared/config";
import { useDevice } from "@/shared/lib/use-device";
import { last12, YDAY } from "../model/home";
import { cx } from "./cx";
import { useClock, type Ctx } from "./home-page";
import { Spark } from "./charts";
import { useSize } from "./use-ui";

const UNITS_BUSY = (c: Ctx, fireId: string) => c.units.some((u) => u.fire_id === fireId && (u.status === "enroute" || u.status === "onscene"));

/**
 * 상황 패널 — 과거 같은 달 대비(실제 API: 지금 관심 영역의 진행 중인 달 release 값·예상) + 감지 목록(원장 경보, AgencyPort).
 * 진행 중인 달은 배수 대신 「{날짜}까지 X (이 추세면 한 달 약 Y)」(api_contract 화면 규칙 — 값은 release value·value_projected 그대로).
 */
export function HomeSide(c: Ctx) {
  /* 폰: 감지 목록은 지도 위 바닥 시트(home-map), 여기는 과거 같은 달 대비만 */
  const phone = useDevice() === "phone";
  return (
    <aside className={cx("panel hm-side")} aria-label={c.t("home.short_label.situation_panel")}>
      <Kpi {...c} />
      {phone ? null : <Feed {...c} />}
    </aside>
  );
}

function Kpi(c: Ctx) {
  const router = useRouter();
  const [ref, w] = useSize<HTMLDivElement>();
  const p = c.partial;
  const last = useMemo(() => {
    if (p) return p;
    for (let i = c.months.length - 1; i >= 0; i--) if (c.months[i]!.value != null) return c.months[i]!;
    return null;
  }, [p, c.months]);
  const spark = last ? last12(c.months, { year: last.year, month: last.month }) : [];
  const aoiT = c.dataAoiName + c.t("home.render_aoibadge.harmonized");
  const aoiTitle = c.dataAoiName + c.t("home.render_aoibadge.harmonized_viirs_equivalent_unit");
  const head = c.t("home.short_label.vs_same_month_in");
  const badge = c.t("home.short_label.excl_target_year");
  const sw = Math.max(160, Math.min(720, (w || 368) - 32));
  return (
    <>
      <div className={cx("hm-kpis-h")}>
        <div className={cx("hm-ttl")}>
          <h2 data-kpih="" title={`${badge} · ${aoiTitle}`}>
            {head}
          </h2>
          <span className={cx("hm-badge")} data-kpib="">
            {badge}
          </span>
        </div>
        <span className={cx("hm-kpis-aoi")} data-kpiaoi="" title={aoiTitle}>
          {aoiT}
        </span>
        <button type="button" className={cx("btn sm hm-go-an")} data-analyze="" title={c.pop ? c.t("home.entry.title", { a: c.dataAoiName, ym: c.fmt.ym(c.pop.year, c.pop.month) }) : undefined} onClick={() => router.push(pageHref(c.lang as Locale, "analysis"))}>
          {c.t("home.short_label.compare")}
        </button>
      </div>
      <div className={cx("hm-kpis")} data-kpis="" ref={ref}>
        <div className={cx("hm-kpi")} data-testid="home-kpi" data-v={last?.value ?? ""} data-vp={last?.value_projected ?? ""}>
          <div className={cx("hm-kpi-k")}>{c.t("home.quick_ranges.this_month")}</div>
          <div className={cx("hm-kpi-v num")}>
            {last == null ? <span className={cx("hm-miss-v")}>{c.calPending ? "–" : c.t("home.val.missing")}</span> : last.value == null ? <span className={cx("hm-miss-v")}>{c.t("home.val.missing")}</span> : c.fmt.num(last.value, last.value < 100 ? 1 : 0)}
            <small title={last?.as_of_date ? `${last.as_of_date}${c.t("home.val.days_so_far_month")}` : undefined}>{c.t("home.val.viirs_eq")}</small>
          </div>
          {last && last.status === "partial" && last.value != null && last.as_of_date ? (
            <div className={cx("hm-kpi-d")}>
              <span className={cx("num")}>
                {last.value_projected != null
                  ? c.t("shell.partial.mtd_proj", { date: last.as_of_date ?? "", v: c.fmt.num(last.value, 1), p: c.fmt.num(last.value_projected, 1) })
                  : c.t("shell.partial.mtd", { date: last.as_of_date ?? "", v: c.fmt.num(last.value, 1) })}
              </span>
            </div>
          ) : last && last.status === "partial" ? (
            /* 진행 중인 달은 배수를 내지 않는다(api_contract 화면 규칙). 스냅숏(MSW)처럼 as_of_date 가 없으면 상태 낱말만 */
            <div className={cx("hm-kpi-d")}>
              <span className={cx("muted")}>{c.t("shell.st.partial")}</span>
            </div>
          ) : last && last.ratio_to_median != null ? (
            <div className={cx("hm-kpi-d")}>
              <b className={cx(last.ratio_to_median >= 1.5 ? "up" : last.ratio_to_median < 0.9 ? "down" : "muted")}>{c.t("home.ratio.short", { x: c.fmt.ratio(last.ratio_to_median) })}</b>
            </div>
          ) : null}
          <div className={cx("hm-kpi-r")}>{c.t("home.val.rel_now", { v: `${c.dataAoiName} · ${last ? c.fmt.ym(last.year, last.month) : "–"}` })}</div>
          <div className={cx("hm-kpi-s")}>
            {c.tok ? <Spark vals={spark} w={sw} h={22} color={c.tok["data-viirs"]} /> : null}
            <span className={cx("dim")}>{c.t("home.val.last_12_months")}</span>
          </div>
        </div>
      </div>
    </>
  );
}

const atL = (c: Ctx, s: string) => (String(s).startsWith(YDAY) ? c.t("home.at.yday", { t: String(s).slice(YDAY.length) }) : String(s));

/** 감지 목록 — part: all(오른쪽·왼쪽 패널) · head/body(폰 바닥 시트 머리·몸, 목업 placeFeed) */
export function Feed(c: Ctx & { part?: "all" | "head" | "body" }) {
  const part = c.part ?? "all";
  const router = useRouter();
  const ms = useClock(c.nowMs);
  const clock = ms == null ? "" : new Intl.DateTimeFormat("en-GB", { timeZone: c.tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  const fireOf = (id: string) => c.fires.find((f) => f.id === id);
  const HAS: Record<string, (a: Alert) => boolean> = {
    live: (a) => {
      const f = fireOf(a.fire_id);
      return !!f && !f.historical && ["new", "ack", "dispatched", "onscene"].includes(f.status);
    },
    new: (a) => a.status === "new",
    busy: (a) => UNITS_BUSY(c, a.fire_id),
  };
  const list = c.alerts.filter((a) => !c.cntSel || HAS[c.cntSel]!(a));
  const open = list.filter((a) => a.status !== "resolved").length;
  const canOpen = c.role === "responder" || c.role === "firefighter";
  const inRange = (f: Fire) => !!c.range && f.detected_at.slice(0, 10) >= c.range.start && f.detected_at.slice(0, 10) <= c.range.end;
  const regIds = c.region ? [c.region] : null;
  const nIn = c.fires.filter((f) => inRange(f) && (!regIds || regIds.includes(f.region))).length;
  const go = (a: Alert) => {
    if (canOpen) {
      router.push(pageHref(c.lang as Locale, "ops"));
      return;
    }
    const f = fireOf(a.fire_id);
    c.setSelFire(a.fire_id);
    if (f) c.fly(f.lat, f.lon, 10.2);
  };
  return (
    <>
      {part !== "body" ? (
      <div className={cx("hm-feed-h")}>
        <div className={cx("hm-ttl")}>
          <span className={cx("hm-live")} aria-hidden="true" />
          <h2>{c.t("home.short_label.detections")}</h2>
          <span className={cx("hm-clock num")} data-clock="" title={c.t("home.short_label.last_update")} suppressHydrationWarning>
            {clock}
          </span>
        </div>
        <span className={cx("hm-feed-n")} data-feedn="">
          {c.kor ? (
            <>
              {c.t("home.feed.n", { n: "" })}
              <b className={cx("num")}>{c.t("home.feed.n_v", { n: list.length })}</b>
              {list.length - open ? <span className={cx("dim")}>{c.t("home.feed.closed", { n: list.length - open })}</span> : null}
            </>
          ) : null}
        </span>
      </div>
      ) : null}
      {part !== "head" && c.kor ? (
        <div className={cx("hm-feed-src muted")} data-ev="">
          <span>{c.lang === "ko" ? c.season : c.t("home.season.autumn")}</span>
          <span title={c.t("home.in_aoi.incident_records_by_report")}>
            {c.t("home.in_aoi.fires_in_period")}
            <b className={cx("num")}>{nIn}</b>
            {c.t("home.svc_val.x_2")}
          </span>
        </div>
      ) : null}
      {part !== "head" ? (
      <div className={cx("hm-feed")} data-feed="" role="list" aria-live="polite">
        {list.length ? (
          list.map((a) => {
            const f = fireOf(a.fire_id);
            const v = (a as { viirs?: number }).viirs;
            const m = (a as { modis?: number }).modis;
            const frp = (a as { frp_max?: number }).frp_max ?? f?.frp_max;
            const pts = v == null && m == null ? null : (v ?? 0) + (m ?? 0);
            const dk = f ? (f.reported ? "reported" : f.kind === "agri" ? "agri" : "early") : null;
            const at = atL(c, a.at);
            return (
              <div
                key={a.id}
                className={cx("hm-al", `hm-l${a.level}`, a.status === "new" && "is-new", c.selFire === a.fire_id && "is-sel")}
                role="listitem"
                tabIndex={0}
                data-alert={a.id}
                data-fire={a.fire_id}
                aria-label={canOpen ? c.t("home.feed.open_aria", { t: c.tl("alert", a.id, "title", a.title) }) : undefined}
                onClick={() => go(a)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                    e.preventDefault();
                    go(a);
                  }
                }}
              >
                <div className={cx("hm-al-top")}>
                  <i className={cx("hm-al-dot")} aria-hidden="true" />
                  <span className={cx("hm-al-title row-t")}>{c.tl("alert", a.id, "title", a.title)}</span>
                  <span className={cx("hm-al-t", /[^\d:\s]/.test(at) ? "tn" : "num")}>{at}</span>
                </div>
                <div className={cx("hm-al-place")}>{f ? c.tl("fire", f.id, "name", f.name) : ""}</div>
                {pts != null || frp != null ? (
                  <div className={cx("hm-al-meta")}>
                    {pts != null ? (
                      <span>
                        {c.t("home.alert_row.detections")}
                        <b className={cx("num")}>{c.fmt.num(pts)}</b>
                      </span>
                    ) : null}
                    {frp != null ? (
                      <span>
                        {c.t("home.alert_row.max_frp")}
                        <b className={cx("num")}>{c.fmt.num(frp, 1)} MW</b>
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className={cx("hm-al-st")}>
                  <span className={cx("hm-al-lv")}>{c.t(`shell.level.${a.level}`)}</span>
                  <span className={cx("st", a.status)}>{c.t(`shell.status.${a.status}`)}</span>
                  {dk ? (
                    <span className={cx("hm-dt", `hm-dt-${dk}`)} title={c.t("home.detect_tag.fire_record_class")}>
                      {c.t(`data.detect.${dk}`)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className={cx("hm-empty")}>
            <b>{c.t(c.cntSel ? "home.empty_feed.no_matching_alerts" : "home.empty_feed.no_new_detections")}</b>
          </div>
        )}
      </div>
      ) : null}
    </>
  );
}
