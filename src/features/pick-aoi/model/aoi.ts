/**
 * 지역(AOI) 위계 순수 함수 — 전 세계 → 나라 → 1급(한국 = 시도) → 시군구(한국만).
 * 원천은 계약 GET /aois(실서버 parent_id·level·bbox). 상황판·지휘 통계·예측 분석이 같은 규칙으로 「고른 지역 = 범위, 그 아래 단 = 행」을 쓴다.
 * 이름·좌표는 지리 정의(값이 아님)라 화면 표시에만 쓴다.
 */
import { aoiOfIso3, iso3OfAdm0 } from "@/shared/lib/adm0";

export interface AoiRec {
  aoi_id: string;
  name_ko: string | null;
  name_en: string | null;
  level: string;
  parent_id: string | null;
  bbox?: number[] | null;
  hidden?: boolean;
  synthetic?: boolean;
}
export type Bbox = [number, number, number, number];

/** 시도 영어 이름(release 에 name_en 이 없음 — 목업 api.js SIDO_EN 그대로). 값이 아니라 이름표다 */
export const SIDO_EN: Record<string, string> = {
  SIDO_11: "Seoul", SIDO_26: "Busan", SIDO_27: "Daegu", SIDO_28: "Incheon", SIDO_29: "Gwangju", SIDO_30: "Daejeon", SIDO_31: "Ulsan", SIDO_36: "Sejong",
  SIDO_41: "Gyeonggi-do", SIDO_43: "Chungcheongbuk-do", SIDO_44: "Chungcheongnam-do", SIDO_46: "Jeollanam-do", SIDO_47: "Gyeongsangbuk-do", SIDO_48: "Gyeongsangnam-do",
  SIDO_50: "Jeju", SIDO_51: "Gangwon", SIDO_52: "Jeonbuk",
};
export const nameEn = (a: { aoi_id: string; name_en: string | null }) => a.name_en || SIDO_EN[a.aoi_id] || null;

export const isKorId = (id: string | null | undefined) => id === "KR" || /^(SIDO|SGG)_/.test(id ?? "") || id === "group:gb-north";
/** AOI → 나라 ISO3: 한국 단위 = KOR, ADM0_XXX = XXX, ADM1_XXX-n = XXX */
export function iso3OfAoi(id: string | null | undefined): string | null {
  if (!id || id === "WORLD") return null;
  if (isKorId(id)) return "KOR";
  const m = /^ADM[01]_([A-Z]{3})/.exec(id);
  return m ? iso3OfAdm0(m[1] as string) : null;
}
/** 나라 색인 코드 → release 지역 id(색인과 release 코드가 다른 나라 4개는 shared/lib/adm0 가 맞춘다) */
export { aoiOfIso3 };

/** 위경도 글자(「36.35, 128.70」 · 「36.35N 128.70E」) */
export function parseLatLon(s: string | null | undefined) {
  const m = /^\s*([+-]?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?\s*(?:,\s*|\s+)([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i.exec(String(s ?? ""));
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (m[2] && /s/i.test(m[2])) lat = -Math.abs(lat);
  if (m[4] && /w/i.test(m[4])) lon = -Math.abs(lon);
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
}

const ROW_LEVELS = new Set(["country", "adm1", "kr_sido", "kr_sgg"]);
/** 그 지역 바로 아래 단(행으로 쓰는 단만 — 대륙·묶음·숨김 제외) */
export function childrenOf(aois: readonly AoiRec[], id: string): AoiRec[] {
  return aois.filter((a) => a.parent_id === id && ROW_LEVELS.has(a.level) && !a.hidden);
}

export interface Scope {
  /** 고른 지역(주소 ?aoi= 또는 나라 AOI) */
  chosen: string;
  /** 범위 = 행의 부모. 고른 지역에 아래 단이 있으면 그 지역, 없으면(시군구·아래 단 없는 1급) 그 부모 */
  scope: string;
  /** 고른 지역이 행 하나일 때 그 행(범위 안 강조) */
  focus: string | null;
  /** 범위 아래 단 */
  rows: AoiRec[];
}
export function scopeOf(aois: readonly AoiRec[], byId: ReadonlyMap<string, AoiRec>, chosen: string): Scope {
  const kids = childrenOf(aois, chosen);
  if (kids.length) return { chosen, scope: chosen, focus: null, rows: kids };
  const par = byId.get(chosen)?.parent_id;
  if (par && byId.has(par) && !/^CONT_/.test(par)) return { chosen, scope: par, focus: chosen, rows: childrenOf(aois, par) };
  /* 아래 단도 위 단도 없는 지역(작은 나라 등): 자기 하나가 행 */
  const self = byId.get(chosen);
  return { chosen, scope: chosen, focus: null, rows: self ? [self] : [] };
}

/** 위 단 사슬(나라부터 그 지역까지 — 대륙·전 세계 제외) */
export function pathOf(byId: ReadonlyMap<string, AoiRec>, id: string): AoiRec[] {
  const out: AoiRec[] = [];
  let cur = byId.get(id);
  for (let i = 0; cur && i < 6; i++) {
    if (cur.level === "continent" || cur.level === "world") break;
    out.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}

export const bboxCenter = (b: readonly number[] | null | undefined): { lat: number; lon: number } | null =>
  b && b.length === 4 ? { lon: ((b[0] as number) + (b[2] as number)) / 2, lat: ((b[1] as number) + (b[3] as number)) / 2 } : null;

/** 여러 상자를 품는 상자 */
export function unionBbox(bs: (readonly number[] | null | undefined)[]): Bbox | null {
  const ok = bs.filter((b): b is number[] => !!b && b.length === 4);
  if (!ok.length) return null;
  return [Math.min(...ok.map((b) => b[0] as number)), Math.min(...ok.map((b) => b[1] as number)), Math.max(...ok.map((b) => b[2] as number)), Math.max(...ok.map((b) => b[3] as number))];
}
/** 상자 넓이(제곱도) — 실서버 /hotspots 은 100 제곱도 이하만 낸다(잰 것 2026-11-15, 40101 range_too_large) */
export const bboxArea = (b: readonly number[] | null | undefined) => (b && b.length === 4 ? ((b[2] as number) - (b[0] as number)) * ((b[3] as number) - (b[1] as number)) : Infinity);
export { HOTSPOT_MAX_AREA } from "@/shared/api"; // 한도 값은 shared/api/limits 한 곳(캘린더·분석 미리 판정과 같은 값)
/** 실서버 /hotspots(layer=reference) 은 한 번에 92일 이하만 낸다(잰 것 2026-11-15) */
export const HOTSPOT_MAX_DAYS = 92;

/** 행 단 이름 키(사전 낱말): 시도 · 시군 · 1급 지역 · 나라 */
export const rowWordKey = (level: string | undefined) =>
  level === "kr_sido" ? "shell.aoi.lv.kr_sido" : level === "kr_sgg" ? "data.rw.kor" : level === "country" ? "shell.aoi.lv.country" : "data.rw.adm1";
