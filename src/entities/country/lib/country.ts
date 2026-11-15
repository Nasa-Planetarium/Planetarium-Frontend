/**
 * 나라 색인 순수 함수 — 목업 core.js countryName·countryShort·continentOf·searchCountries 이식.
 * 색인은 public/geo/countries.json(목업 geo/countries.js 변환, Natural Earth v5.1.2).
 */
import { aoiOfIso3, iso3OfAdm0 } from "@/shared/lib/adm0";
import { tzOffsetMin } from "@/shared/lib/time";

export interface CountryInfo {
  iso3: string;
  iso2?: string;
  name_en: string;
  name_ko?: string;
  bbox: [number, number, number, number];
  c: [number, number];
  tz: string;
  tzs?: string[];
  n1: number;
}

export type Continent = "AS" | "EU" | "AF" | "AM" | "OC";
export const CONTINENTS: Continent[] = ["AS", "EU", "AF", "AM", "OC"];

export const countryName = (c: CountryInfo | undefined, lang: string, fallback = "") =>
  !c ? fallback : (lang !== "en" && c.name_ko) || c.name_en;

const CONT_FIX: Record<string, Continent> = { ERI: "AF", DJI: "AF", RUS: "EU", TUR: "AS", KAZ: "AS", EGY: "AF", GRL: "AM", ISL: "EU", CYP: "EU", GEO: "AS", ARM: "AS", AZE: "AS", PNG: "OC", TLS: "AS", IDN: "AS", FJI: "OC", NZL: "OC", AUS: "OC", MDV: "AS", MDG: "AF", MUS: "AF", SYC: "AF", COM: "AF", CPV: "AF", STP: "AF", PRT: "EU", ESP: "EU", MLT: "EU", FRA: "EU", NOR: "EU", SJM: "EU", USA: "AM", CAN: "AM", CHL: "AM", ATF: "AF", SGS: "AM", FLK: "AM", SHN: "AF", IOT: "AS", HMD: "OC", KIR: "OC", UMI: "OC", PYF: "OC", WSM: "OC", TON: "OC", ASM: "OC" };

/** 대륙(목록 묶음용): 색인에 대륙 필드가 없어 표시 중심점으로 가른다(경계 근처 나라는 어긋날 수 있다 — 표시 묶음일 뿐) */
export function continentOf(c: CountryInfo | undefined): Continent {
  if (!c) return "AS";
  const fix = CONT_FIX[c.iso3];
  if (fix) return fix;
  const [lon, lat] = c.c;
  if (lon < -25 || (lon > 170 && lat > 30)) return lon < -140 || (lon > 170 && lat < 30) ? "OC" : "AM";
  if ((lon > 110 && lat < -10) || lon > 140) return "OC";
  if (lat > 35 && lon < 45) return "EU";
  if (lon < 52 && lat < 37 && !(lon > 34 && lat > 12)) return "AF";
  return "AS";
}

/**
 * 고를 수 있는 나라(ISO3) — 나라 색인에 있고(ISO2 있음 · 목록에 보이는 나라) release 에 자료 있는(has_data≠false) 나라 행이 있는 것.
 * 색인에는 있지만 release 에 행이 없는 나라(투발루 TUV — 잰 것 2026-11-15)를 고르면 화면이 조용히 전 세계로 돌아가므로 고르기 목록·지도에서 뺀다.
 * aois 를 아직 못 받았으면 null(모름 = 막지 않음).
 */
export function pickableIso3(list: readonly CountryInfo[], aois: readonly { aoi_id: string; has_data?: boolean | null }[] | null | undefined): Set<string> | null {
  if (!aois || !aois.length) return null;
  const ok = new Map(aois.map((a) => [a.aoi_id, a.has_data !== false] as const));
  return new Set(list.filter((c) => c.iso2 && ok.get(aoiOfIso3(c.iso3))).map((c) => c.iso3));
}

/**
 * 지역 고르기 목록에서 고를 수 없는 행을 뺀다: 자료 없음(has_data=false) · 나라 색인에 없는 나라와 그 1급
 * (release 에만 있는 ADM0_ATA·GIB·BRI 등 10개 — 고르면 나라 칩이 받지 못해 한국으로 돌아간다). pick = null 이면 자료 없음만 뺀다.
 */
export function pickableAois<T extends { aoi_id: string; has_data?: boolean | null }>(aois: readonly T[], pick: Set<string> | null): T[] {
  return aois.filter((a) => {
    if (a.has_data === false) return false;
    const m = /^ADM[01]_([A-Z]{3})/.exec(a.aoi_id);
    return !pick || !m || pick.has(iso3OfAdm0(m[1] as string));
  });
}

/** 악센트·대소문자·빈칸 무시 */
export const fold = (x: string | undefined) =>
  String(x ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");

/** 검색: ISO3·ISO2 일치 · 영어/한국어 이름 부분 일치(목업 EM.searchCountries) */
export function searchCountries(list: CountryInfo[], q: string, lang: string): CountryInfo[] {
  const f = fold(q);
  if (!f) return list.slice();
  return list.filter(
    (c) =>
      fold(c.iso3) === f ||
      fold(c.iso2) === f ||
      fold(c.name_en).includes(f) ||
      fold(c.name_ko).includes(f) ||
      fold(countryName(c, lang)).includes(f),
  );
}

/** 시간대가 여럿인 나라: tzs 가운데 지금 UTC 차이가 둘 이상 갈리는 나라(목업 EM.multiTz) */
export function multiTz(c: CountryInfo | undefined, ms: number): boolean {
  if (!c?.tzs || c.tzs.length < 2) return false;
  return new Set(c.tzs.map((z) => tzOffsetMin(z, ms))).size > 1;
}

/** 표시 시계 시간대(목업 EM.clockTz): UTC 를 고름 · 시간대가 여럿인 나라(1급 미선택) = UTC, 아니면 나라 tz(한국 Asia/Seoul) */
export function clockTz(c: CountryInfo | undefined, opts: { utc: boolean; regionChosen: boolean; nowMs: number }): string {
  if (opts.utc) return "UTC";
  if (!c) return "UTC";
  if (c.iso3 === "KOR") return "Asia/Seoul";
  if (!opts.regionChosen && multiTz(c, opts.nowMs)) return "UTC";
  return c.tz || "UTC";
}
