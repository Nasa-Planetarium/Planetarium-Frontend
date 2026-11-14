import { describe, expect, it } from "vitest";
import { toastKind } from "./alert-text";

describe("새 경보 토스트 규칙(목업 alert:new)", () => {
  it("내 역할이 대상이면 열기 토스트", () => {
    expect(toastKind({ targets: ["land"] }, "land", false)).toBe("mine");
    expect(toastKind({ targets: ["responder", "firefighter"] }, "firefighter", false)).toBe("mine");
  });
  it("대상이 아니고 긴급대응이 받으면 「전달됨」", () => {
    expect(toastKind({ targets: ["responder", "firefighter"] }, "commander", false)).toBe("forwarded");
    expect(toastKind({ targets: ["responder"] }, null, false)).toBe("forwarded");
  });
  it("피해 면적 담당에게만 간 경보는 다른 역할에 토스트 없음", () => {
    expect(toastKind({ targets: ["land"] }, "responder", false)).toBeNull();
  });
  it("홈이 지도 알림 띠로 보일 때는 셸 토스트 없음", () => {
    expect(toastKind({ targets: ["land"] }, "land", true)).toBeNull();
  });
});
