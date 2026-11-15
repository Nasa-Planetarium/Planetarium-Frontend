"use client";

import { useT } from "@/shared/i18n";
import { STATUS_KEY, type MapStatusKind } from "@/shared/lib/display";
import s from "./map-status.module.css";

/**
 * 지도 상태 줄 하나(표시 규칙서 R11, 2026-11-15). 바탕 지도는 언제나 남기고, 그 위 왼쪽 위에 상태 + 꼬리 한 줄을 둔다.
 * 상태: 불러오는 중 · 이 범위·이 달 감지 0 · 이 지역 자료 없음 · 자료를 받지 못함 · 자료 판이 맞지 않음 · 넓어 점을 받을 수 없음(R13).
 * 꼬리: 진행 중인 달(기준 시각까지) · 속보 자료(NRT) · 잘림 · 기관 예시 안내 같은 덧말. 지도를 문구로 갈아 끼우지 않는다.
 */
export interface MapStatusProps {
  kind: MapStatusKind | null;
  /** 상태 문구 변수(fixed 의 {window} 등) */
  vars?: Record<string, string | number>;
  /** 꼬리 덧말 */
  tail?: string | null;
  action?: { label: string; onClick: () => void } | null;
}

export function MapStatus(o: MapStatusProps) {
  const t = useT();
  if (!o.kind && !o.tail && !o.action) return null;
  return (
    <div className={s.bar} role="status" aria-live="polite" data-map-status={o.kind ?? ""}>
      {o.kind ? <span className={s.st}>{t(STATUS_KEY[o.kind], o.vars)}</span> : null}
      {o.tail ? <span className={s.tail}>{o.tail}</span> : null}
      {o.action ? (
        <button type="button" className={s.btn} onClick={o.action.onClick}>
          {o.action.label}
        </button>
      ) : null}
    </div>
  );
}
