"use client";

import { useLocale } from "next-intl";
import s from "./map-loading.module.css";

/**
 * 지도 불러오는 중 표시(프런트 UI/UX, 2026-11-15).
 * 지도 바탕이 그려지기 전(MapLibre `load` 전)에는 지도 칸 위에 덮개 + 도는 고리 + 문구를 둔다.
 * 쓰는 쪽: 지도 칸(position:relative) 안에 `<MapLoading show={!map} />`.
 */
export function MapLoading({ show }: { show: boolean }) {
  const lang = useLocale();
  if (!show) return null;
  return (
    <div className={s.wrap} role="status" aria-live="polite" data-map-loading="1">
      <span className={s.ring} aria-hidden="true" />
      <span className={s.text}>{lang === "ko" ? "지도 불러오는 중…" : "Loading map…"}</span>
    </div>
  );
}
