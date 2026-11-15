import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, luminance, hexRgb, over } from "./map-color";

/* base.css 의 밝은 지도 토큰을 읽어 대비를 잰다(F14). 값을 바꾸면 이 시험이 같이 본다 */
const css = readFileSync(path.resolve(__dirname, "../../../app/styles/base.css"), "utf8");
const tok = (n: string) => {
  const m = new RegExp(`--${n}:[ ]*(#[0-9a-fA-F]{3,8})[;\n ]`).exec(css);
  if (!m) throw new Error(`base.css 에 --${n} 없음`);
  return m[1] as string;
};
const land = tok("map-land");
const sea = tok("map-sea");

describe("대비 계산", () => {
  it("흰색·검정 = 21, 같은 색 = 1", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777", "#777")).toBe(1);
  });
  it("합성: 불투명도 1 = 앞색, 0 = 바탕", () => {
    expect(over("#102030", 1, "#ffffff")).toEqual(hexRgb("#102030"));
    expect(over("#102030", 0, "#ffffff")).toEqual([255, 255, 255]);
  });
});

describe("밝은 지도 토큰(base.css) — 데이터 표지 3:1 · 글자 4.5:1", () => {
  it("감지량 램프 mh0–mh6: 땅 대비 3:1 이상, 많을수록 진하다(휘도 단조 감소)", () => {
    const L = [0, 1, 2, 3, 4, 5, 6].map((i) => luminance(hexRgb(tok(`mh${i}`))));
    [0, 1, 2, 3, 4, 5, 6].forEach((i) => expect(contrast(tok(`mh${i}`), land), `mh${i}`).toBeGreaterThanOrEqual(3));
    for (let i = 1; i < L.length; i++) expect(L[i] as number).toBeLessThan(L[i - 1] as number);
  });
  it("월 감지량 칸(기본 확대 불투명도 .88)도 땅 대비 3:1", () => {
    [1, 2, 3, 4, 5].forEach((i) => expect(contrast(over(tok(`mh${i}`), 0.88, land), land), `mh${i}`).toBeGreaterThanOrEqual(3));
  });
  it("지도 강조·경로·센서·확산 시간·소실 범위: 땅·바다 대비 3:1", () => {
    ["map-sel", "map-route", "map-viirs", "map-modis", "map-warn-ink", "map-burn", "map-burn-sel", "map-dot-edge", "map-focus"].forEach((n) => {
      expect(contrast(tok(n), land), `${n}/land`).toBeGreaterThanOrEqual(3);
      expect(contrast(tok(n), sea), `${n}/sea`).toBeGreaterThanOrEqual(3);
    });
  });
  it("지도 글자: 이름표 잉크 ↔ halo 4.5:1, 바다 위 4.5:1", () => {
    ["map-label", "map-label-hi"].forEach((n) => {
      expect(contrast(tok(n), tok("map-halo")), n).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tok(n), sea), n).toBeGreaterThanOrEqual(4.5);
    });
  });
  it("가림(.55)을 얹은 이웃 땅은 바다보다 밝게 남는다(땅·바다 뒤집힘 방지)", () => {
    expect(luminance(over(tok("map-mask"), 0.55, land))).toBeGreaterThan(luminance(hexRgb(sea)));
  });
  it("예측 3단: 옅음 → 진함 = 낮음 → 높음, 높음은 땅 대비 3:1", () => {
    const l = ["map-lv-low", "map-lv-normal", "map-lv-high"].map((n) => luminance(hexRgb(tok(n))));
    expect(l[0] as number).toBeGreaterThan(l[1] as number);
    expect(l[1] as number).toBeGreaterThan(l[2] as number);
    expect(contrast(tok("map-lv-high"), land)).toBeGreaterThanOrEqual(3);
  });
  it("덮개·지도 칸 바탕 = 바다색(남색 번쩍임 0)", () => {
    expect(tok("map-void").toLowerCase()).toBe(sea.toLowerCase());
  });
  it("대륙 견본: 흰 알약(땅색) 위 3:1", () => {
    ["na", "sa", "eu", "af", "as", "oc"].forEach((c) => expect(contrast(tok(`map-cont-${c}`), land), c).toBeGreaterThanOrEqual(3));
  });
});
