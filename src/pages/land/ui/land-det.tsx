"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import type { CountryInfo } from "@/entities/country";
import { DetBoard } from "@/widgets/det-board";
import { adm1RegionsQuery, MapCanvas } from "@/widgets/map-canvas";
import { cx } from "./cx";

/**
 * 한국 밖(목업 EM.ui.detPage — GLOBAL §6.2): 피해 면적 원장은 경북 시나리오뿐이라 감지 묶음 화면.
 * 머리(개수 띠: 24시간 감지 묶음 · 감지 화소 면적) + 공통 지도(지난 24시간 실제 감지 점) + 「미확인 감지」 표(화소 면적 열) — widgets/det-board.
 */
export function LandDet({ iso3, info }: { iso3: string; info: CountryInfo | undefined }) {
  const lang = useLocale();
  const regs = useQuery(adm1RegionsQuery(iso3, lang)).data;
  return (
    <DetBoard
      page="land"
      iso3={iso3}
      info={info}
      cx={cx}
      testId="land-det"
      regions={regs}
      renderMap={(m) => (
        <MapCanvas className={cx("map")} testId="land-det-map" iso3={iso3} view={m.view} regions={regs ?? []} hotspots={m.hotspots} layers={{ units: false, routes: false, fires: false, heat: false }} status={m.status} />
      )}
    />
  );
}
