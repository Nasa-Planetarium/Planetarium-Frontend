"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Alert, Fire } from "@/shared/agency";
import { pageHref, type Locale } from "@/shared/config";
import { useDevice } from "@/shared/lib/use-device";
import { useQuery } from "@tanstack/react-query";
import type { Bbox } from "@/features/pick-aoi";
import { ApiError } from "@/shared/api";
import { hotspotsQuery } from "../api/queries";
import { dayCount, last12, prevRange, rangeTxt, YDAY } from "../model/home";
import { cx } from "./cx";
import { HomeEvents } from "./home-events";
import { RETRY_429, YoyKpis } from "./home-yoy";
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
      <HomeEvents {...c} />
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
  /* 전년 대비(목업 renderYoY 머리): 「전년 대비 · 1년 전 같은 날짜 · 26.11.05–11.11 vs 25.11.05–11.11」 */
  const y = c.yoy && c.range ? { curr: c.range, prev: prevRange(c.range) } : null;
  const H = y ? c.t("home.render_range.year_over_year") : head;
  const B = y ? c.t("home.render_yo_y.same_dates_a_year") : badge;
  const A = y ? `${rangeTxt(y.curr)} vs ${rangeTxt(y.prev)}` : aoiT;
  const AT = y ? `${c.dataAoiName}${c.t("home.render_yo_y.period")}${y.curr.start} – ${y.curr.end} (${dayCount(y.curr.start, y.curr.end)}${c.t("home.render_yo_y.days_last_year")}${y.prev.start} – ${y.prev.end} · ${c.t("data.yoy.note")}` : aoiTitle;
  return (
    <>
      {/* 깜박임(목업 pulseKPI): 바뀔 때마다 머리를 새로 달아 애니메이션을 다시 건다 */}
      <div key={c.pulse} className={cx("hm-kpis-h", c.pulse > 0 && "is-pulse")} data-pulse={c.pulse}>
        <div className={cx("hm-ttl")}>
          <h2 data-kpih="" title={`${B} · ${AT}`}>
            {H}
          </h2>
          <span className={cx("hm-badge", y && "hm-badge-yoy")} data-kpib="">
            {B}
          </span>
        </div>
        <span className={cx("hm-kpis-aoi")} data-kpiaoi="" title={AT}>
          {A}
        </span>
        <button type="button" className={cx("btn sm hm-go-an")} data-analyze="" title={c.pop ? c.t("home.entry.title", { a: c.dataAoiName, ym: c.fmt.ym(c.pop.year, c.pop.month) }) : undefined} onClick={() => router.push(pageHref(c.lang as Locale, "analysis", `from=home&aoi=${encodeURIComponent(c.aoi)}${c.pop ? `&ym=${c.pop.year}-${String(c.pop.month).padStart(2, "0")}` : ""}`))}>
          {c.t("home.short_label.compare")}
        </button>
      </div>
      {y ? (
        <div className={cx("hm-kpis is-yoy")} data-kpis="" data-yoy="" ref={ref}>
          <YoyKpis {...c} curr={y.curr} prev={y.prev} width={w} />
        </div>
      ) : (
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
      )}
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
  /* 기간 안 사건(목업 inRange): 진화 시각(없으면 감지)이 시작 뒤 · 감지가 끝 앞 */
  const inRange = (f: Fire) => !!c.range && String((f.contained_at as string | undefined) ?? f.detected_at).slice(0, 10) >= c.range.start && f.detected_at.slice(0, 10) <= c.range.end;
  const det = useDetections(c);
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
          ) : det.list ? (
            /* 상한 40 을 총수처럼 보이지 않게 「40 / 322 묶음」(목업 g2 N6) */
            <b className={cx("num")}>{(det.list.length > 40 ? `${c.fmt.num(40)} / ` : "") + c.t("shell.det.feed_n", { n: det.list.length })}</b>
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
        ) : !c.kor ? (
          <DetRows c={c} det={det} />
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

type Det = { id: string; region: string; lat: number; lon: number; n: number; viirs: number; modis: number; high: number; frp_max: number; last_ms: number; level: number };

/**
 * 한국 밖 감지 묶음(목업 EM.detections · g1fix 비평 #2): 경보 원장이 없는 나라는 지난 24시간 실제 /hotspots 점을 1급 지역 안 0.3° 칸으로 묶는다.
 * 시각 기준 = 화면 시계(원장 now) · 범위 = 나라 본토 상자(100 제곱도 넘으면 지금 지도 범위). 단계: 15점↑ 또는 FRP 100↑ = 3 · 5점↑ 또는 40↑ = 2 · 그 밖 1.
 */
function useDetections(c: Ctx): { list: Det[] | null; err: string | null; zoom: boolean } {
  const info = c.info as { bbox_main?: Bbox; bbox?: Bbox } | undefined;
  const cb = info?.bbox_main ?? info?.bbox ?? null;
  const area = (b: Bbox) => Math.abs((b[2] - b[0]) * (b[3] - b[1]));
  const box = cb && area(cb) <= 100 ? (cb.map((v) => Math.round(v * 20) / 20) as unknown as Bbox) : c.detBox;
  const now = c.nowMs;
  const d0 = now != null ? new Date(now - 86400e3).toISOString().slice(0, 10) : "";
  const d1 = now != null ? new Date(now).toISOString().slice(0, 10) : "";
  const q = useQuery({ ...hotspotsQuery(box ?? [0, 0, 0, 0], d0, d1, c.mv), ...RETRY_429, enabled: !c.kor && !!box && now != null && !!c.mv });
  const list = useMemo(() => {
    const hs = (q.data as unknown as { hotspots?: { latitude: number; longitude: number; acq_datetime_utc: string; instrument: string; frp: number | null; confidence: string; adm1_code?: string | null; adm1?: string | null }[] } | undefined)?.hotspots;
    if (!hs || now == null) return null;
    const cells = new Map<string, { region: string; n: number; viirs: number; modis: number; high: number; frp_max: number; la: number; lo: number; last: number }>();
    for (const h of hs) {
      const ms = Date.parse(h.acq_datetime_utc);
      if (!(ms > now - 86400e3 && ms <= now)) continue;
      const region = h.adm1_code ?? h.adm1 ?? "";
      const k = `${region}|${Math.floor(h.latitude / 0.3)}|${Math.floor(h.longitude / 0.3)}`;
      const x = cells.get(k) ?? { region, n: 0, viirs: 0, modis: 0, high: 0, frp_max: 0, la: 0, lo: 0, last: 0 };
      x.n++;
      if (h.instrument === "MODIS") x.modis++;
      else x.viirs++;
      if (h.confidence === "h") x.high++;
      x.frp_max = Math.max(x.frp_max, h.frp ?? 0);
      x.la += h.latitude;
      x.lo += h.longitude;
      x.last = Math.max(x.last, ms);
      cells.set(k, x);
    }
    return [...cells.entries()]
      .map(([k, x]) => ({ id: `D-${k.replace(/\|/g, "-")}`, region: x.region, lat: x.la / x.n, lon: x.lo / x.n, n: x.n, viirs: x.viirs, modis: x.modis, high: x.high, frp_max: Math.round(x.frp_max * 10) / 10, last_ms: x.last, level: x.n >= 15 || x.frp_max >= 100 ? 3 : x.n >= 5 || x.frp_max >= 40 ? 2 : 1 }))
      .sort((a, b) => b.level - a.level || b.n - a.n || b.last_ms - a.last_ms);
  }, [q.data, now]);
  const e = q.error instanceof ApiError ? q.error : null;
  return { list, err: e ? c.t(e.code === "data_not_loaded" ? "shell.err.data_not_loaded" : "shell.err.request") : null, zoom: !box };
}

function DetRows({ c, det }: { c: Ctx; det: ReturnType<typeof useDetections> }) {
  if (det.err || det.zoom || !det.list) return <div className={cx("hm-empty")}>{det.err ? <b>{det.err}</b> : det.zoom ? <b>{c.t("map.level.fixed", { window: c.t("map.status.recent") })}</b> : <b>–</b>}</div>;
  if (!det.list.length)
    return (
      <div className={cx("hm-empty")}>
        <b>{c.t("shell.det.none")}</b>
      </div>
    );
  const name = (id: string) => c.mapRegions.find((r) => r.id === id)?.name ?? (c.scope.nameOf(`ADM1_${id}`) || id);
  const hm = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: c.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  const ll = (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? "W" : "E"}`;
  return (
    <>
      {det.list.slice(0, 40).map((d) => {
        const rn = name(d.region);
        const go = () => c.fly(d.lat, d.lon, 9);
        return (
          <div
            key={d.id}
            className={cx("hm-al", `hm-l${d.level}`)}
            role="listitem"
            tabIndex={0}
            data-det={d.id}
            aria-label={`${c.t("shell.det.row")}, ${rn}`}
            onClick={go}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                e.preventDefault();
                go();
              }
            }}
          >
            <div className={cx("hm-al-top")}>
              <i className={cx("hm-al-dot")} aria-hidden="true" />
              <span className={cx("hm-al-title row-t")}>{c.t("shell.det.row")}</span>
              <span className={cx("hm-al-t num")}>{hm(d.last_ms)}</span>
            </div>
            <div className={cx("hm-al-place")}>
              {rn} <span className={cx("dim num")}>{ll(d.lat, d.lon)}</span>
            </div>
            <div className={cx("hm-al-meta")}>
              <span>
                {c.t("home.alert_row.detections")}
                <b className={cx("num")}>{c.fmt.num(d.n)}</b>
              </span>
              <span>
                {c.t("home.alert_row.max_frp")}
                <b className={cx("num")}>{c.fmt.num(d.frp_max, 1)} MW</b>
              </span>
            </div>
            <div className={cx("hm-al-st")}>
              <span className={cx("hm-al-lv")}>{c.t(`shell.level.${d.level}`)}</span>
              <span className={cx("dim num")}>
                VIIRS {c.fmt.num(d.viirs)} · MODIS {c.fmt.num(d.modis)}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
