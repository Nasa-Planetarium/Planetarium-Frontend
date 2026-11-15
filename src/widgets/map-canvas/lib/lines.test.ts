import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasLines, LINES_ISO3 } from "./lines";

const DIR = path.resolve(__dirname, "../../../../public/geo/lines");

describe("lines manifest", () => {
  it("목록 = public/geo/lines 폴더의 <ISO3>.json (파일을 더하면 목록도)", () => {
    const files = fs.readdirSync(DIR).filter((f) => /^[A-Z]{3}\.json$/.test(f)).map((f) => f.slice(0, 3)).sort();
    expect(files.length).toBeGreaterThan(0);
    expect([...LINES_ISO3].sort()).toEqual(files);
  });
  it("없는 나라·빈 값은 요청하지 않는다", () => {
    expect(hasLines("KOR")).toBe(true);
    expect(["JPN", "USA", "BRA", "", null, undefined].map(hasLines)).toEqual([false, false, false, false, false, false]);
  });
});
