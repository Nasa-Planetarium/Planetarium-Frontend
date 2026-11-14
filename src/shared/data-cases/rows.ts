import type { CaseContext, CaseRow, View } from "./types";

/** release 기간과 센서 첫 달(원자료 보기). MODIS Terra 는 release 첫 달과 같다 — 목업 cases.js 그대로 */
export const FIRST = "2000-11";
export const LAST = "2026-11";
export const SENSOR_FROM: Record<View, string> = { value: FIRST, raw_modis: FIRST, raw_viirs: "2012-02" };

const p2 = (n: number) => String(n).padStart(2, "0");
export const ymOf = (r: CaseRow) => (r.year != null && r.month != null ? `${r.year}-${p2(r.month)}` : null);
export const viewOf = (c: CaseContext): View => c.view ?? "value";
export const valOf = (r: CaseRow, c: CaseContext): number | null => {
  const v = r[viewOf(c)];
  return v === undefined ? null : v;
};
export const hasNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** 구간 열 이름: /calendar 달 행·칸 속성은 value_lo/value_hi, 다른 모양은 lo/hi */
export const loOf = (r: CaseRow) => (r.value_lo !== undefined ? r.value_lo : (r.lo ?? null));
export const hiOf = (r: CaseRow) => (r.value_hi !== undefined ? r.value_hi : (r.hi ?? null));
