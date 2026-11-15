import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 다시 갈라지지 않게(표시 규칙서 §4 정적 검사 · 2-Strike): 화면(pages · widgets)이 지도 눈금·램프·원 크기를 스스로 만들면 실패한다.
 * 지도 표시 규칙은 src/shared/lib/display 한 곳에만 둔다.
 */
const root = path.resolve(__dirname, "../../..");
function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const SRC = [...files(path.join(root, "pages")), ...files(path.join(root, "widgets"))];
const RULES: [RegExp, string][] = [
  [/function makeRamp\b/, "makeRamp 복사본 — shared/lib/display shellRamp 를 쓴다"],
  [/\bDOT_STEPS\b/, "단계 경계 복사본 — display STEPS/stepOf"],
  [/\bconst K_R\b|\bconst R_ST\b|\bcellRadius\b/, "원 크기 복사본 — display radiusPx/radiusExpr"],
  [/sqrt\([^)]*\/\s*\(?\s*(o\.)?(scaleMax|vmax)/, "지역 최댓값 대비 상대 색 — 지도 칸은 절대 5단계(R3)"],
  [/log1p\(c\.value\)\s*\/\s*mx/, "화면 안 최댓값 대비 로그 색 — 절대 5단계(R3)"],
  [/type:\s*"heatmap"/, "열지도 — 감지 점 하나(R1)"],
  [/"map-viirs"|"map-modis"/, "센서 두 색 — 감지 점 한 색(R6)"],
];

describe("지도 표시 규칙이 화면마다 갈라지지 않는다", () => {
  it("화면 파일에 눈금·램프·원 크기 복사본이 없다", () => {
    const hits: string[] = [];
    for (const f of SRC) {
      const s = fs.readFileSync(f, "utf8");
      for (const [re, why] of RULES) if (re.test(s)) hits.push(`${path.relative(root, f)}: ${why}`);
    }
    expect(hits).toEqual([]);
  });
  it("검사 대상 파일을 실제로 읽었다(0 개로 통과하지 않게)", () => {
    expect(SRC.length).toBeGreaterThan(50);
  });
});
