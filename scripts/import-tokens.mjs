#!/usr/bin/env node
/**
 * 목업 index.html 의 :root 토큰 블록 → src/app/styles/tokens.css (글자 그대로).
 *
 * 쓰는 법: node scripts/import-tokens.mjs --mockup <목업 폴더>
 *
 * - 범위: 첫 `:root{` 부터 `*{box-sizing` 바로 앞까지(원시·의미·글자·간격·모양·모션·기기군 4블록·터치·폴더블 경첩)
 *   + `:root:lang(en)` 글꼴 순서 한 줄.
 * - 옛 이름(별칭) 선언만 뺀다(설계 §4.1 「옮기지 않는다」). 값·순서·주석은 그대로.
 * - 색·크기 값을 손으로 고치지 않는다. 바꾸려면 목업을 고치고 이 스크립트를 다시 돌린다.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const i = argv.indexOf("--mockup");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const mockup = path.resolve(i >= 0 ? argv[i + 1] : process.env.MOCKUP_DIR ?? path.join(root, "..", "fe-src", "mockup"));
const html = fs.readFileSync(path.join(mockup, "index.html"), "utf8");

const start = html.indexOf(":root{");
const end = html.indexOf("*{box-sizing");
if (start < 0 || end < 0 || end < start) throw new Error("index.html 에서 :root 블록을 못 찾음");
let block = html.slice(start, end).trimEnd();

const langLine = html.split("\n").find((l) => l.startsWith(":root:lang(en){--font-body"));
if (!langLine) throw new Error(":root:lang(en) 글꼴 줄을 못 찾음");

const ALIASES = [
  "brand", "brand-rule", "font-head", "font-mark",
  "fs-big", "fs-5", "fs-6", "fs-num-m", "fs-num-l", "fs-hed", "fs-hed-2", "fs-dek",
  "bg", "panel", "panel-2", "panel-3", "line", "line-2", "ink", "muted", "dim",
  "signal", "signal-soft", "lv1", "lv2", "lv3", "lv4", "viirs", "r-1", "r-2", "r-3",
];
let removed = 0;
for (const a of ALIASES) {
  const re = new RegExp(`\\s*--${a.replace(/-/g, "\\-")}:[^;]*;`, "g");
  block = block.replace(re, () => {
    removed++;
    return "";
  });
}
// 별칭이 빠져 빈 줄만 남은 곳 정리
block = block.split("\n").filter((l) => l.trim() !== "").join("\n");

const out = `/* 자동 생성 — scripts/import-tokens.mjs. 손으로 고치지 말 것(목업 index.html :root 가 원천).
   원천: ${path.basename(mockup)}/index.html · 옛 이름(별칭) 선언 ${removed}개 제외(설계 frontend-design.md §4.1).
   색·글자·간격·모양·모션·기기군 크기의 유일한 출처. 컴포넌트는 의미 토큰(--surface-* --text-* --line-* --alert-* …)만 쓴다. */
${block}

/* 다국어 글꼴 토큰(GLOBAL §1.8): 영어는 라틴 Plex Sans 를 앞에 */
${langLine.trim()}
`;
const dest = path.join(root, "src", "app", "styles", "tokens.css");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`tokens.css ${out.length} B · 별칭 ${removed}개 제외 → ${path.relative(root, dest)}`);
