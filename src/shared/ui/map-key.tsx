"use client";

import { useT } from "@/shared/i18n";
import { DOT_TOKEN, KEY_LEVEL, RMAX, RMIN, STATIC_TOKEN, STEP_LABELS, STEP_TOKENS, STEPS, type Level } from "@/shared/lib/display";
import s from "./map-key.module.css";

/**
 * 지도 범례 하나(표시 규칙서 R7, 2026-11-15) — 모든 지도 화면(캘린더 점 지도 · 세계 재생 · 분석 칸 지도 · 공통 지도 · 지휘 통계)이 이것만 쓴다.
 * 제목 「월 감지량 (0.1° 칸당)」 + 시간 창 · 5칸 견본(R4 색, 단계별 원 크기) · 경계 숫자 0.1 · 1 · 10 · 100 · 지금 단계 줄.
 * 점 단계(L3·L4)는 견본 대신 점 견본 하나와 개수. 위치는 지도 왼쪽 아래이고 폰에서도 숨기지 않는다(한 줄로 접힘).
 * 쓰는 쪽: 지도 칸(position:relative) 안에 `<MapKey level={…} win={…} />`.
 */
export interface MapKeyProps {
  level: Level | "fixed" | null;
  /** 시간 창 글(「2025년 3월」 · 「최근 24시간」 · 「2025-03-01–03-31」) — 단계가 바뀌어도 그대로(R13) */
  win?: string | null;
  /** 진행 중 꼬리(「진행 중 · 11-14까지」) */
  tail?: string | null;
  /** 점 단계에서 그린 점 수 */
  nPts?: number | null;
  /** 시야에 산업 열원(합계 제외) 빈 점이 있는가 */
  staticPts?: boolean;
  /** 숫자 꼴(화면 언어) */
  fmt?: (n: number) => string;
  /** 지도 아래쪽에 다른 막대가 있을 때 띄울 높이(px) */
  lift?: number;
  /** 지도 밖 범례 줄 안에 둘 때(자리 고정 없이) */
  inline?: boolean;
  testId?: string;
}

export function MapKey(o: MapKeyProps) {
  const t = useT();
  const pts = o.level === "L3" || o.level === "L4";
  const fmt = o.fmt ?? ((n: number) => String(n));
  return (
    <div
      className={o.inline ? `${s.key} ${s.inline}` : s.key}
      data-map-key=""
      data-tick-avoid=""
      data-level={o.level ?? ""}
      data-steps={STEPS.join(",")}
      data-tokens={STEP_TOKENS.join(",")}
      data-testid={o.testId}
      style={o.lift ? { bottom: `calc(var(--sp-3) + ${o.lift}px)` } : undefined}
    >
      <div className={s.head}>
        <b>{t("map.key.title")}</b>
        {o.win ? <span className={s.win}>{o.win}</span> : null}
        {o.tail ? <span className={s.tail}>{o.tail}</span> : null}
      </div>
      {pts ? (
        <div className={s.row}>
          <span className={s.sw}>
            <i className={s.dot} style={{ ["--c" as string]: `var(--${DOT_TOKEN})` }} />
            <span>{o.nPts != null ? t("map.key.pts_n", { n: fmt(o.nPts) }) : t("map.key.lv.L3")}</span>
          </span>
          {o.staticPts ? (
            <span className={s.sw}>
              <i className={s.ring} style={{ ["--c" as string]: `var(--${STATIC_TOKEN})` }} />
              <span>{t("map.key.static")}</span>
            </span>
          ) : null}
        </div>
      ) : o.level === "fixed" ? null : (
        <div className={s.row}>
          <span className={s.end}>{t("map.key.few")}</span>
          <span className={s.ramp} aria-hidden="true">
            {STEP_TOKENS.map((tk, k) => (
              <span key={tk} className={s.cell}>
                <i style={{ ["--c" as string]: `var(--${tk})`, ["--d" as string]: `${(RMIN[k] as number) + (RMAX[k] as number)}px` }} />
              </span>
            ))}
            <span className={s.nums}>
              {STEP_LABELS.map((l, j) => (
                <span key={l} style={{ left: `${(j + 1) * 20}%` }} className={s.num}>
                  {l}
                </span>
              ))}
            </span>
          </span>
          <span className={s.end}>{t("map.key.many")}</span>
          <span className={s.sr}>{`${t("map.key.few")} < ${STEP_LABELS.join(" · ")} < ${t("map.key.many")}`}</span>
        </div>
      )}
      {o.level && o.level !== "fixed" ? <div className={s.lv}>{t(KEY_LEVEL[o.level])}</div> : null}
    </div>
  );
}
