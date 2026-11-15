/**
 * 지도 색 도우미(F14 밝은 지도, 2026-11-15) — 순수 함수. 대비 계산(WCAG 2.x 상대 휘도) · 알파 합성 · 지도 램프 토큰 이름.
 * 화면은 토큰 값을 getComputedStyle 로 읽고, 단위 시험(map-color.test.ts)은 base.css 를 읽어 같은 함수로 잰다.
 */
export type Rgb = [number, number, number];

export function hexRgb(h: string): Rgb {
  let s = String(h || "").trim().replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** 상대 휘도(WCAG 2.x) */
export const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** 대비비(1–21) */
export function contrast(a: string | Rgb, b: string | Rgb) {
  const la = luminance(typeof a === "string" ? hexRgb(a) : a);
  const lb = luminance(typeof b === "string" ? hexRgb(b) : b);
  const [lo, hi] = la < lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** 앞색을 불투명도 alpha 로 바탕 위에 얹은 색(sRGB 합성 — MapLibre·캔버스가 하는 것과 같다) */
export function over(fg: string, alpha: number, bg: string): Rgb {
  const f = hexRgb(fg);
  const g = hexRgb(bg);
  return [0, 1, 2].map((i) => Math.round((f[i] as number) * alpha + (g[i] as number) * (1 - alpha))) as Rgb;
}

/** 지도 감지량 램프 토큰(밝은 바탕용, 많을수록 진하게) · 어두운 셸 위 칸 램프 토큰 */
export const MAP_RAMP = ["mh0", "mh1", "mh2", "mh3", "mh4", "mh5", "mh6"] as const;
export const SHELL_RAMP = ["h0", "h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** 대륙 바로 가기 견본 토큰 */
export const contTok = (id: string) => `map-cont-${id}`;
