import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CellDots } from "./charts";

/* 칸 지도 SVG(2026-11-15 「비교 분석에서 지도 잘 안 나와」 회귀) — 바다 바탕 · 땅 면 · 고른 면 테두리 · 원 반지름이 칸 간격을 따른다 */
const sq = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]] as [number, number][];
const ramp = () => "#f00";
const render = (o: Partial<Parameters<typeof CellDots>[0]>) =>
  renderToStaticMarkup(createElement(CellDots, { cells: [{ lat: 36.05, lon: 128.05, value: 5, title: "a" }], ramp, scaleMax: 5, width: 560, label: "칸 지도", ...o }));

describe("CellDots 칸 지도", () => {
  it("땅이 있으면 바다 바탕 + 땅 면 + 고른 면 테두리", () => {
    const html = render({ land: [{ rings: [sq(126, 34, 130, 38)] }, { rings: [sq(128, 35.5, 129, 36.5)], on: true }], cellDeg: 0.1 });
    expect(html).toContain("data-an-sea");
    expect(html).toContain("data-an-land");
    expect(html).toContain("data-an-on");
    expect(html).toContain('data-land="2"');
  });
  it("땅 자료가 없어도 바다 바탕 위 원은 그린다", () => {
    const html = render({ cellDeg: 0.1 });
    expect(html).toContain("data-an-sea");
    expect(html).not.toContain("data-an-land");
    expect((html.match(/<circle/g) ?? []).length).toBe(1);
  });
  it("1° 칸 큰 나라: 원 반지름이 칸 간격의 절반을 넘지 않아 서로 덮지 않는다", () => {
    const cells = Array.from({ length: 30 }, (_, i) => ({ lat: 30 + (i % 6), lon: -110 + Math.floor(i / 6) * 10, value: 5000, title: "" }));
    const html = render({ cells, cellDeg: 1, scaleMax: 5000 });
    const rs = [...html.matchAll(/ r="([\d.]+)"/g)].map((m) => Number(m[1]));
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(html);
    expect(vb).not.toBeNull();
    /* 가로 40°+1° 를 560px 에 — 칸 간격 ≈ 560/41/cos(33°) 근처, 원 지름은 그보다 작다 */
    rs.forEach((r) => expect(2 * r).toBeLessThan(560 / 41 / Math.cos((33 * Math.PI) / 180) + 0.01));
  });
});
