/**
 * 화면 8개와 탭 정의 — 셸(머리줄)이 이 표 하나만 읽는다(목업 CALENDAR-PIVOT §3).
 *
 * 탭 순서: [캘린더][비교 분석][방법·검증] ¦ [상황판][역할 탭 1개] — ¦ 뒤는 예시 로그인 뒤에만(결정 F12)
 * - 로그인 전 공개 탭 = 실제 데이터 3개, 기본 화면 = calendar (`/ko` 는 `/ko/calendar/` 로 보낸다)
 * - 상황판(home)은 어느 역할로든 예시 로그인하면 열린다 · 로그인 전 직접 열면 잠긴 화면(역할 화면과 같은 방식)
 * - ops·land·cmd·lab 은 그 역할로 로그인했을 때 그 역할 탭 하나만 보인다(결정 F6)
 */
export const PAGE_IDS = ["calendar", "analysis", "method", "home", "ops", "land", "cmd", "lab"] as const;
export type PageId = (typeof PAGE_IDS)[number];

export const ROLE_IDS = ["responder", "firefighter", "land", "commander", "scientist"] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** lucide 아이콘 이름은 shared/ui/icon.tsx 의 표에서 고른다 */
export type NavIcon = "calendar" | "activity" | "book" | "grid" | "siren" | "ruler" | "chart" | "flask";

export interface PageDef {
  id: PageId;
  /** 탭 무리(앞 = 공개 실제 데이터 화면, 뒤 = 로그인 뒤 협업 시나리오 화면) · 역할 화면이면 null */
  group: "challenge" | "console" | null;
  icon: NavIcon;
  /** 이 화면을 여는 역할(null = 로그인 없이 누구나 · 역할 전부 = 어느 역할로든 로그인하면) */
  roles: readonly RoleId[] | null;
}

export const PAGES: Record<PageId, PageDef> = {
  calendar: { id: "calendar", group: "challenge", icon: "calendar", roles: null },
  analysis: { id: "analysis", group: "challenge", icon: "activity", roles: null },
  method: { id: "method", group: "challenge", icon: "book", roles: null },
  home: { id: "home", group: "console", icon: "grid", roles: ROLE_IDS },
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

/** 이 역할(null = 로그인 전)로 그 화면을 열 수 있나 — 탭과 잠긴 화면이 같은 규칙을 읽는다 */
export function canOpen(page: PageId, role: RoleId | null): boolean {
  const roles = PAGES[page].roles;
  return !roles || (role !== null && roles.includes(role));
}

/** 머리줄 탭 목록: 공개 3 ¦ (로그인 뒤) 상황판 + 역할 탭 — 로그인 전이면 뒤 무리는 빈 목록(결정 F12) */
export function tabsFor(role: RoleId | null): { challenge: PageId[]; console: PageId[] } {
  const challenge = PAGE_IDS.filter((p) => PAGES[p].group === "challenge");
  if (!role) return { challenge, console: [] };
  const consoleTabs: PageId[] = PAGE_IDS.filter((p) => PAGES[p].group === "console" && canOpen(p, role));
  consoleTabs.push(ROLE_DEF[role].nav);
  return { challenge, console: consoleTabs };
}
