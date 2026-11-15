"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import type { CountryInfo } from "@/entities/country";
import { BURN_WINDOW, eventPlace, eventView, fireEventsQuery, type FireEvent } from "@/entities/fire-event";
import { methodQuery } from "@/entities/release";
import { useT } from "@/shared/i18n";
import { aoiOfIso3 } from "@/shared/lib/adm0";
import { DetBoard } from "@/widgets/det-board";
import { EventCard, EventRows, evState, stateText, useEventLayer } from "@/widgets/fire-events";
import { adm1RegionsQuery, MapCanvas, type MapCanvasHandle } from "@/widgets/map-canvas";
import { cx } from "./cx";

/**
 * 한국 밖(목업 EM.ui.detPage — GLOBAL §6.2): 피해 면적 원장은 경북 시나리오뿐이라 감지 묶음 화면.
 * 머리(개수 띠: 24시간 감지 묶음 · 감지 화소 면적) + 공통 지도(지난 24시간 실제 감지 점) + 「미확인 감지」 표(화소 면적 열) — widgets/det-board.
 * 그 아래 실제 「위성 확인 연소」(F15 fire_events): 아르헨티나는 2016~2025 연소 면적 큰 순 사건(지도에 상자·중심 원), 자료가 없는 나라는 「이 지역 자료 없음」 한 줄.
 */
export function LandDet({ iso3, info }: { iso3: string; info: CountryInfo | undefined }) {
  const lang = useLocale();
  const t = useT();
  const regs = useQuery(adm1RegionsQuery(iso3, lang)).data;
  const mv = useQuery(methodQuery()).data?.method_version ?? null;
  const evQ = useQuery(fireEventsQuery({ aoi_id: aoiOfIso3(iso3), ...BURN_WINDOW, sort: "burned_area_km2", limit: 12 }, mv));
  const st = evState(evQ);
  const events = useMemo(() => evQ.data?.events ?? [], [evQ.data]);
  const [evSel, setEvSel] = useState<string | null>(null);
  const evE = events.find((e) => e.event_id === evSel) ?? null;
  const ref = useRef<MapCanvasHandle | null>(null);
  const getMap = useCallback(() => ref.current?.map() ?? null, []);
  useEventLayer(getMap, events, evSel, setEvSel);
  useEffect(() => {
    if (evE) ref.current?.fitBounds(eventView(evE), 48);
  }, [evE]);
  const place = (e: FireEvent) => (e.adm1_code ? (regs?.find((r) => r.id === e.adm1_code)?.name ?? eventPlace(e)) : eventPlace(e));
  return (
    <div className={cx("ld-dw")}>
      <DetBoard
        page="land"
        iso3={iso3}
        info={info}
        cx={cx}
        testId="land-det"
        regions={regs}
        renderMap={(m) => (
          <MapCanvas ref={ref} className={cx("map")} testId="land-det-map" iso3={iso3} view={m.view} regions={regs ?? []} hotspots={m.hotspots} cells={m.cells} cellsKey={m.cellsLabel} layers={{ units: false, routes: false, fires: false }} status={m.status} />
        )}
      />
      <section className={cx("panel ld-dev")} aria-label={t("events.land.head")} data-testid="land-events" data-state={st}>
        <div className={cx("sechd")}>
          <h2>{t("events.land.head")}</h2>
          {st === "ok" ? <span className={cx("sh-n")}>{t("events.land.sub")}</span> : null}
        </div>
        {st === "ok" ? (
          <div className={cx("ld-dev-b")}>
            <EventRows events={events} selId={evSel} onPick={(e) => setEvSel(evSel === e.event_id ? null : e.event_id)} place={place} testId="land-ev-rows" />
            {evE ? <EventCard e={evE} place={place(evE)} /> : null}
          </div>
        ) : (
          <p className={cx("ld-none")}>{stateText(st, t)}</p>
        )}
      </section>
    </div>
  );
}
