/**
 * 화면 8개와 탭 정의 — 셸(머리줄)이 이 표 하나만 읽는다(목업 CALENDAR-PIVOT §3).
 *
 * 탭 순서: [캘린더][비교 분석][방법·검증] ¦ [상황판] [+ 역할 탭 1개(로그인 시)]
 * - 로그인 전 기본 화면 = calendar (`/ko` 는 `/ko/calendar/` 로 보낸다)
 * - ops·land·cmd·lab 은 역할 로그인 뒤 그 역할 탭 하나만 보인다(결정 C8 · F6)
 */
export const PAGE_IDS = ["calendar", "analysis", "method", "home", "ops", "land", "cmd", "lab"] as const;
export type PageId = (typeof PAGE_IDS)[number];

export const ROLE_IDS = ["responder", "firefighter", "land", "commander", "scientist"] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** lucide 아이콘 이름은 shared/ui/icon.tsx 의 표에서 고른다 */
export type NavIcon = "calendar" | "activity" | "book" | "grid" | "siren" | "ruler" | "chart" | "flask";

export interface PageDef {
  id: PageId;
  /** 공개 탭 무리(앞 = 챌린지 화면, 뒤 = 관제 화면) · 역할 화면이면 null */
  group: "challenge" | "console" | null;
  icon: NavIcon;
  /** 이 화면을 여는 역할(없으면 누구나) */
  roles: readonly RoleId[] | null;
}

export const PAGES: Record<PageId, PageDef> = {
  calendar: { id: "calendar", group: "challenge", icon: "calendar", roles: null },
  analysis: { id: "analysis", group: "challenge", icon: "activity", roles: null },
  method: { id: "method", group: "challenge", icon: "book", roles: null },
  home: { id: "home", group: "console", icon: "grid", roles: null },
  ops: { id: "ops", group: null, icon: "siren", roles: ["responder", "firefighter"] },
  land: { id: "land", group: null, icon: "ruler", roles: ["land"] },
  cmd: { id: "cmd", group: null, icon: "chart", roles: ["commander"] },
  lab: { id: "lab", group: null, icon: "flask", roles: ["scientist"] },
};

/** 역할 → 탭 화면·첫 화면·아이콘(목업 core.js ROLE_DEF 그대로) */
export const ROLE_DEF: Record<RoleId, { icon: "siren" | "truck" | "ruler" | "compass" | "flask"; home: PageId; nav: PageId }> = {
  responder: { icon: "siren", home: "ops", nav: "ops" },
  firefighter: { icon: "truck", home: "ops", nav: "ops" },
  land: { icon: "ruler", home: "land", nav: "land" },
  commander: { icon: "compass", home: "cmd", nav: "cmd" },
  scientist: { icon: "flask", home: "lab", nav: "lab" },
};

export const DEFAULT_PAGE: PageId = "calendar";

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** 화면 경로(정적 내보내기 trailingSlash) */
export const pageHref = (locale: Locale, page: PageId, query?: string) =>
  `/${locale}/${page}/${query ? (query.startsWith("?") ? query : `?${query}`) : ""}`;

/** 머리줄 탭 목록: 공개 3 ¦ 상황판 + 역할 탭 */
export function tabsFor(role: RoleId | null): { challenge: PageId[]; console: PageId[] } {
  const challenge = PAGE_IDS.filter((p) => PAGES[p].group === "challenge");
  const consoleTabs: PageId[] = PAGE_IDS.filter((p) => PAGES[p].group === "console");
  if (role) consoleTabs.push(ROLE_DEF[role].nav);
  return { challenge, console: consoleTabs };
}
