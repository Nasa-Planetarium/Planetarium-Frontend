"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { countryName, useCountry } from "@/entities/country";
import { methodQuery } from "@/entities/release";
import { useT } from "@/shared/i18n";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { prefs } from "@/shared/lib/prefs";
import { aoiIndexQuery } from "../api/aois";
import { aoiOfIso3, iso3OfAoi, nameEn, pathOf, scopeOf, type AoiRec } from "./aoi";

/**
 * 지금 지역 범위 — 주소 ?aoi=(캘린더·분석과 같은 이름) → 지금 나라 AOI(한국 = KR).
 * 나라 칩과 어긋나는 aoi 는 버린다. 다른 나라 지역을 고르면 나라(?c=)도 함께 바꾼다.
 * useSearchParams 를 쓰므로 부르는 쪽은 <Suspense> 안이어야 한다.
 */
export function useAoiScope() {
  const t = useT();
  const lang = useLocale();
  const router = useRouter();
  const pathname = usePath();
  const sp = useQueryParams();
  const { iso3, list: countries } = useCountry();
  const mq = useQuery(methodQuery());
  const mv = mq.data?.method_version ?? null;
  const aq = useQuery(aoiIndexQuery(mv));
  const aois = useMemo(() => aq.data ?? [], [aq.data]);
  const byId = useMemo(() => new Map(aois.map((a) => [a.aoi_id, a] as const)), [aois]);
  const cidx = useMemo(() => new Map(countries.map((c) => [c.iso3, c] as const)), [countries]);

  const own = aoiOfIso3(iso3);
  const urlAoi = sp.get("aoi");
  const chosen = urlAoi && urlAoi !== "WORLD" && iso3OfAoi(urlAoi) === iso3 && (!aq.data || byId.has(urlAoi)) ? urlAoi : own;
  const sc = useMemo(() => scopeOf(aois, byId, chosen), [aois, byId, chosen]);

  const nameOf = useCallback(
    (a: AoiRec | string | null | undefined): string => {
      const r = typeof a === "string" ? byId.get(a) : a;
      const id = typeof a === "string" ? a : (a?.aoi_id ?? "");
      if (!r) return id === "KR" ? countryName(cidx.get("KOR"), lang, id) : /^ADM0_/.test(id) ? countryName(cidx.get(id.slice(5)), lang, id) : id;
      if (r.aoi_id === "WORLD") return t("shell.aoi.world");
      if (r.level === "country") {
        const ci = cidx.get(iso3OfAoi(r.aoi_id) ?? "");
        if (ci) return countryName(ci, lang, r.name_ko ?? r.aoi_id);
      }
      if (lang !== "ko") return nameEn(r) ?? r.name_ko ?? r.aoi_id;
      return r.name_ko || r.name_en || r.aoi_id;
    },
    [byId, cidx, lang, t],
  );

  const setAoi = useCallback(
    (id: string | null) => {
      const q = new URLSearchParams(sp.toString());
      const i3 = id ? iso3OfAoi(id) : null;
      if (i3 && i3 !== iso3) {
        if (i3 === "KOR") q.delete("c");
        else q.set("c", i3);
        q.delete("r");
        prefs.set("country", i3);
      }
      if (!id || id === aoiOfIso3(i3 ?? iso3)) q.delete("aoi");
      else q.set("aoi", id);
      const s = q.toString();
      router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
    },
    [sp, iso3, router, pathname],
  );

  return {
    mv,
    ready: !!aq.data,
    error: aq.error,
    aois,
    byId,
    countries,
    iso3,
    own,
    ...sc,
    rec: byId.get(sc.chosen) ?? null,
    scopeRec: byId.get(sc.scope) ?? null,
    path: pathOf(byId, sc.chosen),
    nameOf,
    setAoi,
  };
}
export type AoiScope = ReturnType<typeof useAoiScope>;
