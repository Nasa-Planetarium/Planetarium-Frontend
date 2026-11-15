/**
 * FWI 표시 규칙(release fwi_meta · 계약 FwiDay) — 화면은 값을 다시 계산하지 않고 파일이 정한 등급 이름만 단계로 옮긴다.
 * 기본 배지 = 상대 등급(fwi_rel_class, 모델팀 app_default_badge). 절대 등급(fwi_class, 캐나다 기준)은 상세에.
 */
export const FWI_REL_CLASSES = ["below_normal", "normal", "above_normal", "well_above_normal"] as const;
export type FwiRelClass = (typeof FWI_REL_CLASSES)[number];
export const FWI_ABS_CLASSES = ["low", "moderate", "high", "very_high", "extreme"] as const;

/** 상대 등급 → 경보 색 단계(1 낮음 … 4 매우 높음) — 머리줄 칸 색(LV_C)과 같은 자리 */
export const FWI_REL_LEVEL: Readonly<Record<FwiRelClass, 1 | 2 | 3 | 4>> = {
  below_normal: 1,
  normal: 2,
  above_normal: 3,
  well_above_normal: 4,
};

/** FWI 자료가 있는 나라(나라 색인 코드) — 그 밖 나라는 머리줄에 FWI 칸을 그리지 않는다 */
export const FWI_ISO3 = ["KOR", "ARG"] as const;
export const hasFwi = (iso3: string) => (FWI_ISO3 as readonly string[]).includes(iso3);

/** 2026-11-11 → { m: 11, d: 11 } (날짜 글자 그대로 — 시간대 변환 없음, NASA POWER 현지 태양시 날) */
export function mdOf(date: string | null | undefined): { m: number; d: number } | null {
  const x = /^\d{4}-(\d{2})-(\d{2})$/.exec(date ?? "");
  return x ? { m: Number(x[1]), d: Number(x[2]) } : null;
}
