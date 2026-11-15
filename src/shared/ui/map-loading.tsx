"use client";

import { useT } from "@/shared/i18n";
import s from "./map-loading.module.css";

/**
 * 지도 불러오는 중 표시(프런트 UI/UX, 2026-11-15 · F14 다듬기).
 * 지도 바탕이 그려지기 전(MapLibre `load` 전)에는 지도 칸 위에 덮개 + 도는 고리 + 문구를 둔다.
 * - 덮개 바탕 = 바다색(--map-void = --map-sea): 남색 덮개가 밝은 지도로 바뀔 때 번쩍이던 것(LF-1–4)을 없앤다.
 * - 짧은 지연(180ms) 뒤에만 보인다: 빨리 뜨는 지도는 덮개가 아예 안 보인다(CSS animation-delay — 접근성 알림은 그대로).
 * - 지도를 한 번 만든 뒤에는 쓰는 쪽이 다시 띄우지 않는다(캘린더 달 바꿈은 지도를 유지한다).
 * 쓰는 쪽: 지도 칸(position:relative) 안에 `<MapLoading show={!map} />`.
 */
export function MapLoading({ show }: { show: boolean }) {
  const t = useT();
  if (!show) return null;
  return (
    <div className={s.wrap} role="status" aria-live="polite" data-map-loading="1">
      <span className={s.ring} aria-hidden="true" />
      <span className={s.text}>{t("shell.map.loading")}</span>
    </div>
  );
}
