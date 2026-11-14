import type { Alert } from "@/shared/agency";
import type { TFn } from "@/shared/i18n";

/** 경보 제목(목업 EM.tl("alert", id, "title", title)) — 화면에서 새로 올린 경보는 사전 키(title_key)로 */
export function alertTitle(t: TFn, a: Alert): string {
  if (typeof a.title_key === "string") return t(a.title_key);
  const k = `data.alert.${a.id}.title`;
  const v = t(k);
  return v === k ? a.title : v;
}

/** 경보가 속한 나라(목업 EM.alertCountry) — 원장 경보는 경북(KOR) */
export const alertCountry = (a: Alert) => (typeof a.iso3 === "string" ? a.iso3 : "KOR");

/**
 * 새 경보 토스트 규칙(목업 core.js bus "alert:new"):
 * - 홈이 지도 알림 띠로 직접 보여 줄 때(quiet) → 없음
 * - 내 역할이 대상 → 단계 토스트 9초 + [열기](읽음 → 역할 첫 화면 + 경보 초점)
 * - 아니고 대상에 긴급대응이 있으면 → 7초 「{불}, 경보·출동 수신함에 전달됨」
 * - 그 밖 → 없음
 */
export function toastKind(a: Pick<Alert, "targets">, role: string | null, quiet: boolean): "mine" | "forwarded" | null {
  if (quiet) return null;
  if (role && a.targets.includes(role)) return "mine";
  if (a.targets.includes("responder")) return "forwarded";
  return null;
}
