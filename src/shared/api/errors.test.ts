import { describe, expect, it } from "vitest";
import { ApiError, heavyRetry, rateWaitMs } from "./errors";

const rl = (detail: string, ra?: number | null) => new ApiError(429, "rate_limited", { type: "", title: "", status: 429, detail, code: "rate_limited" } as never, undefined, ra);

describe("429 기다림(실서버 heavy 한도)", () => {
  it("Retry-After 헤더가 있으면 그 값(초) + 0.25 초", () => {
    expect(rateWaitMs(rl("x", 7))).toBe(7250);
  });
  it("헤더가 없으면 본문 「retry after N s」", () => {
    expect(rateWaitMs(rl("too many requests (rate limit scope heavy); retry after 24 s"))).toBe(24250);
  });
  it("1–30 초로 자른다 · 429 가 아니면 null", () => {
    expect(rateWaitMs(rl("retry after 90 s"))).toBe(30000);
    expect(rateWaitMs(new ApiError(400, "range_too_large", null))).toBeNull();
    expect(rateWaitMs(new Error("x"))).toBeNull();
  });
  it("무거운 요청 재시도는 429 만 3번까지", () => {
    expect(heavyRetry(0, rl("retry after 7 s"))).toBe(true);
    expect(heavyRetry(3, rl("retry after 7 s"))).toBe(false);
    expect(heavyRetry(0, new ApiError(400, "range_too_large", null))).toBe(false);
  });
});
