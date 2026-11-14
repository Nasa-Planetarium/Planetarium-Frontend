import { queryOptions } from "@tanstack/react-query";
import type { CountryInfo } from "../lib/country";

/** 나라 색인(부팅 때 한 번) — 정적 파일, 계약 API 아님 */
export const countriesQuery = () =>
  queryOptions({
    queryKey: ["geo", "countries"] as const,
    queryFn: async () => {
      const r = await fetch("/geo/countries.json");
      if (!r.ok) throw new Error(`countries.json ${r.status}`);
      return (await r.json()) as CountryInfo[];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

/** 나라 1급 경계(그 나라를 고를 때 하나만 지연 로드 — public/geo/c/<ISO3>.json) */
export const boundaryQuery = (iso3: string) =>
  queryOptions({
    queryKey: ["geo", "boundary", iso3] as const,
    queryFn: async () => {
      const r = await fetch(`/geo/c/${encodeURIComponent(iso3)}.json`);
      if (!r.ok) throw new Error(`geo/c/${iso3}.json ${r.status}`);
      return (await r.json()) as unknown;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
