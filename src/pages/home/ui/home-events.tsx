"use client";

import { countOf, type FireEvent } from "@/entities/fire-event";
import { EventRows, stateText, useEvFmt } from "@/widgets/fire-events";
import { cx } from "./cx";
import type { Ctx } from "./home-page";

const ROWS = 3;

/**
 * 상황판 「기간 안 위성 사건」(F15) — 실제 fire_events(한국·아르헨티나): 고른 지역 · 고른 기간과 겹치는 사건.
 * 기관 목 「기간 안 사건(신고 기준)」 줄은 그대로 둔다 — 신고 기록(기관 원장)과 위성 사건은 출처·정의가 달라 같은 칸이 아니다(F13: 기관 고유 칸은 목 유지).
 * 줄은 감지 3개 이상을 큰 순(모델팀 권장 목록 필터)으로, 그런 사건이 없으면 받은 순 그대로. 누르면 지도가 그 사건으로 간다(지도에 상자·중심 원).
 */
export function HomeEvents(c: Ctx) {
  const f = useEvFmt();
  const ev = c.events;
  const st = ev.state;
  const list = ev.data;
  const big = list ? list.events.filter((e) => e.n_det >= 3) : [];
  const rows = (big.length ? big : (list?.events ?? [])).slice(0, ROWS);
  const n = list && st !== "na" ? countOf(list) : null;
  const pick = (e: FireEvent) => {
    c.setEvSel(c.evSel === e.event_id ? null : e.event_id);
    c.fly(e.centroid_lat, e.centroid_lon, 10);
  };
  return (
    <section className={cx("hm-ev")} data-testid="home-events" data-state={st} data-n={n?.n ?? ""} aria-label={f.t("events.home.head")}>
      <div className={cx("hm-ev-h")}>
        <h2>{f.t("events.home.head")}</h2>
        {n ? <b className={cx("num")}>{f.t(n.atLeast ? "events.n_plus" : "events.n", { n: f.num(n.n) })}</b> : null}
      </div>
      {st === "ok" ? (
        <>
          {big.length ? <p className={cx("hm-ev-s")}>{f.t("events.home.more")}</p> : null}
          <EventRows events={rows} selId={c.evSel} onPick={pick} place={c.evPlace} testId="home-ev-rows" />
        </>
      ) : (
        <p className={cx("hm-ev-s")}>{stateText(st, f.t)}</p>
      )}
    </section>
  );
}
