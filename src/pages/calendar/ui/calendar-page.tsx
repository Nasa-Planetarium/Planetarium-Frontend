"use client";

import { PageFrame } from "@/widgets/page-frame";

/**
 * ① 연소 활동 캘린더(챌린지 화면, 로그인 전 기본)
 * 원천: 목업 #calendar (CALENDAR-PIVOT §5, i18n calendar.*)
 * 데이터: 실제 데이터: entities/month-value calendarQuery · shared/data-cases judgeMonth
 * 골격 단계: 제목(머리)만 있다. 본문은 화면 담당이 PageFrame children 으로 채운다 — 소유 폴더는 OWNERS.md.
 */
export function CalendarPage() {
  return <PageFrame page="calendar" />;
}
