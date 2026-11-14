"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePath, useQueryParams } from "@/shared/lib/nav";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { prefs } from "@/shared/lib/prefs";
import { boundaryQuery, countriesQuery } from "../api/countries";
import type { CountryInfo } from "../lib/country";

const RECENT = "recentCountries";

/**
 * 지금 나라(ISO3). 원천 순서(목업 EM.boot): 주소 ?c= → 저장값 em.country → KOR.
 * 기본값 KOR 은 주소에서 뺀다(GLOBAL §5.4). 바꾸면 경계를 먼저 받고(칩 aria-busy) 주소·저장값·최근 목록을 고친다.
 * useSearchParams 를 쓰므로 부르는 쪽은 <Suspense> 안이어야 한다(정적 내보내기 규칙).
 */
export function useCountry() {
  const sp = useQueryParams();
  const router = useRouter();
  const pathname = usePath();
  const qc = useQueryClient();
  const { data: list } = useQuery(countriesQuery());
  const index = useMemo(() => new Map((list ?? []).map((c) => [c.iso3, c] as const)), [list]);
  const [busy, setBusy] = useState(false);

  const fromUrl = sp.get("c");
  const saved = typeof window !== "undefined" ? prefs.get("country") : null;
  const iso3 = fromUrl && (!list || index.has(fromUrl)) ? fromUrl : saved && index.has(saved) ? saved : "KOR";
  const info: CountryInfo | undefined = index.get(iso3);

  const recent = useCallback((): CountryInfo[] => {
    try {
      const arr = JSON.parse(prefs.get(RECENT) ?? "[]") as string[];
      return arr.map((x) => index.get(x)).filter((x): x is CountryInfo => !!x).slice(0, 3);
    } catch {
      return [];
    }
  }, [index]);

  const setCountry = useCallback(
    async (next: string) => {
      const target = index.has(next) ? next : "KOR";
      setBusy(true);
      try {
        if (target !== "KOR") await qc.fetchQuery(boundaryQuery(target));
      } finally {
        setBusy(false);
      }
      prefs.set("country", target);
      const rc = [target, ...recent().map((c) => c.iso3).filter((x) => x !== target)].slice(0, 3);
      prefs.set(RECENT, JSON.stringify(rc));
      const q = new URLSearchParams(sp.toString());
      if (target === "KOR") q.delete("c");
      else q.set("c", target);
      q.delete("r");
      const qs = q.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [index, qc, recent, router, pathname, sp],
  );

  return { iso3, info, list: list ?? [], busy, setCountry, recent };
}
