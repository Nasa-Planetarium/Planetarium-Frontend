/**
 * check-pages-out 가 실제로 위반을 잡는지 — 가짜 out/ 을 만들어 잰다(모양이 아니라 성질 확인).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspect, LIMITS } from "./check-pages-out.mjs";

const dirs = [];
function fakeOut({ mode = '"http"', headers = "/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n" } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pages-out-"));
  dirs.push(d);
  fs.mkdirSync(path.join(d, "_next", "static", "chunks"), { recursive: true });
  fs.writeFileSync(path.join(d, "_next", "static", "chunks", "a.js"), `r=n("NEXT_PUBLIC_DATA_MODE",${mode},["msw","http"],"msw")`);
  fs.writeFileSync(path.join(d, "index.html"), "<!doctype html>");
  if (headers !== null) fs.writeFileSync(path.join(d, "_headers"), headers);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("check-pages-out", () => {
  it("한도 안 + 모드 일치 → 문제 0", () => {
    const { problems, stats } = inspect(fakeOut(), { mode: "http" });
    expect(problems).toEqual([]);
    expect(stats.modes).toEqual(["http"]);
  });

  it("모드가 다르거나 값 없이 빌드했으면 잡는다", () => {
    expect(inspect(fakeOut({ mode: '"msw"' }), { mode: "http" }).problems.join()).toMatch(/데이터 모드/);
    expect(inspect(fakeOut({ mode: "void 0" }), { mode: "http" }).problems.join()).toMatch(/unset/);
  });

  it("25 MiB 넘는 파일을 잡는다", () => {
    const d = fakeOut();
    const big = path.join(d, "dem", "big.bin");
    fs.mkdirSync(path.dirname(big), { recursive: true });
    fs.writeFileSync(big, "");
    fs.truncateSync(big, LIMITS.fileBytes + 1);
    expect(inspect(d, { mode: "http" }).problems.join()).toMatch(/25 MiB 초과: dem\/big\.bin/);
  });

  it("_headers 가 없거나 규칙이 100 개를 넘으면 잡는다", () => {
    expect(inspect(fakeOut({ headers: null })).problems.join()).toMatch(/_headers 없음/);
    const many = Array.from({ length: 101 }, (_, i) => `/p${i}/*\n  X-A: 1`).join("\n");
    expect(inspect(fakeOut({ headers: many })).problems.join()).toMatch(/규칙 101/);
  });
});
