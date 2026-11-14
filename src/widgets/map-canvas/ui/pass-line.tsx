"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { clockTz, countriesQuery } from "@/entities/country";
import { nextPass } from "@/entities/satellite-pass";
import { useNowMs } from "@/entities/situation";
import { useT } from "@/shared/i18n";
import { usePath } from "@/shared/lib/nav";
import { localHM } from "@/shared/lib/time";
import { useDevice } from "@/shared/lib/use-device";
import { usePref } from "@/shared/lib/use-pref";
import s from "./map-canvas.module.css";

/** 나라 색인이 오기 전 한국 기준점(머리줄과 같은 값) */
const KOR_C: [number, number] = [36.5, 127.9];

/**
 * 폰 「다음 통과」 줄 — 목업 map3d .m3-passln(DIRECTION-R8 §4.2): 폰 머리줄에서 빠진 다음 위성 통과를
 * 경보·출동 지도 왼쪽 위 한 줄로 「다음 위성 S-NPP 14:44 (24분)」. 폰에서만 · 경보·출동 화면에서만(목업 EM.currentPage() === "ops").
 * 값은 머리줄과 같은 계산(entities/satellite-pass, 기준점 = 나라 표시 중심) — 분이 바뀔 때만 다시 센다(목업 30초 다시 쓰기).
 */
export function PassLine({ iso3, off }: { iso3: string; off?: boolean }) {
  const t = useT();
  const phone = useDevice() === "phone";
  const page = usePath().split("/").filter(Boolean)[1];
  // 나라 색인은 react-query 로 바로(useCountry 는 주소 ?c= 를 읽어 Suspense 가 필요하다 — 지도는 어디서나 쓰인다)
  const { data: list } = useQuery(countriesQuery());
  const info = list?.find((c) => c.iso3 === iso3);
  const nowMs = useNowMs();
  const [clockUTC] = usePref("clockUTC");
  const nowMin = nowMs != null ? Math.floor(nowMs / 60000) : null;
  const atLat = info ? info.c[1] : KOR_C[0];
  const atLon = info ? info.c[0] : KOR_C[1];
  const nx = useMemo(() => (nowMin == null ? null : nextPass(nowMin * 60000, [atLat, atLon])), [nowMin, atLat, atLon]);
  if (off || !phone || page !== "ops" || !nx || nowMs == null) return null;
  const tz = clockTz(info, { utc: clockUTC === "1", regionChosen: false, nowMs });
  return (
    <div className={s.passln} data-passln="">
      <span>{t("shell.top.next")}</span>
      <b>
        {nx.sat} {localHM(nx.ms, tz)}
      </b>
      <span>({t("shell.dur.m", { n: Math.max(0, Math.round((nx.ms - nowMs) / 60000)) })})</span>
    </div>
  );
}
