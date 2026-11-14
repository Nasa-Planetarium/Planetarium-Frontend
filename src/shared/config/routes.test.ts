import { describe, expect, it } from "vitest";
import { PAGE_IDS, ROLE_IDS, canOpen, tabsFor } from "./routes";

/** 결정 F12 — 로그인 전 공개 탭 = 실제 데이터 3개, 상황판은 예시 로그인 뒤 */
describe("tabsFor", () => {
  it("로그인 전에는 공개 3개만, 뒤 무리는 빈 목록", () => {
    expect(tabsFor(null)).toEqual({ challenge: ["calendar", "analysis", "method"], console: [] });
  });
  it.each(ROLE_IDS)("%s 로 로그인하면 상황판 + 그 역할 탭 하나", (role) => {
    const t = tabsFor(role);
    expect(t.challenge).toEqual(["calendar", "analysis", "method"]);
    expect(t.console).toHaveLength(2);
    expect(t.console[0]).toBe("home");
  });
});

describe("canOpen", () => {
  it("공개 3개는 누구나, 상황판은 로그인해야", () => {
    for (const p of ["calendar", "analysis", "method"] as const) expect(canOpen(p, null)).toBe(true);
    expect(canOpen("home", null)).toBe(false);
    for (const r of ROLE_IDS) expect(canOpen("home", r)).toBe(true);
  });
  it("역할 화면은 그 역할만", () => {
    expect(canOpen("lab", "scientist")).toBe(true);
    expect(canOpen("lab", "commander")).toBe(false);
    expect(canOpen("ops", "firefighter")).toBe(true);
    expect(canOpen("ops", null)).toBe(false);
  });
  it("탭에 보이는 화면은 모두 열 수 있다", () => {
    for (const r of [null, ...ROLE_IDS]) {
      const t = tabsFor(r);
      for (const p of [...t.challenge, ...t.console]) expect(canOpen(p, r)).toBe(true);
    }
    expect(PAGE_IDS).toContain("home");
  });
});
