import { describe, expect, it } from "vitest";
import { fitLevel, MAX_FIT_LEVEL } from "./fit-level";

describe("머리줄 넘침 단계(fitTop)", () => {
  it("넘치지 않으면 0", () => {
    expect(fitLevel(() => false)).toBe(0);
  });
  it("단계 3 에서 넘침이 풀리면 3", () => {
    expect(fitLevel((k) => k < 3)).toBe(3);
  });
  it("끝까지 넘쳐도 상한(8)에서 멈춘다", () => {
    expect(fitLevel(() => true)).toBe(MAX_FIT_LEVEL);
  });
  it("앞 단계부터 차례로 잰다(건너뛰지 않음)", () => {
    const seen: number[] = [];
    fitLevel((k) => {
      seen.push(k);
      return k < 2;
    });
    expect(seen).toEqual([0, 1, 2]);
  });
});
