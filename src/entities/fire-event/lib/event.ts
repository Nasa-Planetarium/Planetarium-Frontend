/**
 * 화재 사건 도움 함수(값을 만들지 않는다 — release 값을 읽어 표시 모양으로만 옮긴다, A1).
 */
import type { components } from "@/shared/api";

type S = components["schemas"];
export type FireEvent = S["FireEvent"];
export type FireEventList = S["FireEventList"];
export type FireEventDetail = S["FireEventDetail"];
export type Coverage = S["Coverage"];
export type EventsSort = "sum_weight" | "start_date" | "burned_area_km2";
export interface EventsParams {
  aoi_id?: string;
  bbox?: readonly [number, number, number, number];
  start: string;
  end: string;
  min_det?: number;
  sort?: EventsSort;
  limit?: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 한 달 창(1일..말일, 현지 날짜) */
export function monthWindow(year: number, month: number): { start: string; end: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(last)}` };
}

/** 계약 기간 한도(≤ 3,700일, 40106) 안으로 시작을 당긴다 — end 기준 n일 창 */
export function daysBack(end: string, n: number): string {
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

/** 피해 면적 화면의 「위성 확인 연소」 기간: 연소 면적 자료가 있는 해(2012~2025) 중 계약 한도(3,700일) 안 최근 10년 */
export const BURN_WINDOW = { start: "2016-01-01", end: "2025-12-31" } as const;

/** 위성 확인 연소 면적 상태: null = 자료 없음(2012~2025 밖), 0 = 확인 안 됨, 양수 = 확인(하한) */
export type BurnState = "na" | "none" | "km2";
export const burnState = (e: Pick<FireEvent, "burned_area_km2">): BurnState => (e.burned_area_km2 == null ? "na" : e.burned_area_km2 > 0 ? "km2" : "none");

/** 사건 상자(감지 점 상자) → 지도 윤곽 [위도, 경도] 사각형. 감지 1개처럼 넓이가 0 이면 null(중심 원만 그린다) */
export function eventBox(e: Pick<FireEvent, "lat_min" | "lat_max" | "lon_min" | "lon_max">): [number, number][] | null {
  if (!(e.lat_max > e.lat_min && e.lon_max > e.lon_min)) return null;
  return [
    [e.lat_min, e.lon_min],
    [e.lat_min, e.lon_max],
    [e.lat_max, e.lon_max],
    [e.lat_max, e.lon_min],
  ];
}

/** 사건으로 지도 맞춤 범위(서, 남, 동, 북) — 상자에 여유 pad° (넓이 0 이면 중심 ± pad) */
export function eventView(e: Pick<FireEvent, "lat_min" | "lat_max" | "lon_min" | "lon_max">, pad = 0.05): [number, number, number, number] {
  return [e.lon_min - pad, e.lat_min - pad, e.lon_max + pad, e.lat_max + pad];
}

/** 사건 자리 이름: 시군구 목록(파일 sgg_all 그대로) → 시도 → 나라 코드 */
export function eventPlace(e: Pick<FireEvent, "sgg_all" | "sido_nm" | "country" | "adm1_code">): string {
  const sgg = (e.sgg_all ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (sgg.length) return [e.sido_nm, sgg.join("·")].filter(Boolean).join(" ");
  return e.sido_nm ?? e.adm1_code ?? e.country ?? "";
}

/** 기간 표기: 하루면 그 날, 아니면 「시작 – 끝」(같은 해면 끝은 월-일) */
export function eventSpan(e: Pick<FireEvent, "start_date" | "end_date">): string {
  if (e.start_date === e.end_date) return e.start_date;
  return `${e.start_date} – ${e.end_date.slice(0, 4) === e.start_date.slice(0, 4) ? e.end_date.slice(5) : e.end_date}`;
}

/** 응답이 「자료 없음」인지(범위 밖) — 「자료는 있으나 해당 없음」(빈 배열 + available)과 가른다 */
export const noCoverage = (l: Pick<FireEventList, "coverage"> | undefined | null) => !!l && !l.coverage.available;

/** 사건 수 표기용: total 이 있으면 그 값, 없으면(서버가 못 셈) 받은 수 + 「이상」 표시 */
export function countOf(l: Pick<FireEventList, "total" | "count" | "truncated">): { n: number; atLeast: boolean } {
  if (l.total != null) return { n: l.total, atLeast: false };
  return { n: l.count, atLeast: l.truncated };
}
