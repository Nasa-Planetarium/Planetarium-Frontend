#!/usr/bin/env node
/**
 * 목업 geo/ → public/geo/ (나라 색인 JSON + 세계 윤곽 + 나라별 1급 경계).
 *
 * 쓰는 법: node scripts/import-geo.mjs --mockup <목업 폴더>
 *
 * - geo/countries.js(window.EM_COUNTRIES = [...]) → public/geo/countries.json (부팅 때 머리줄 나라 칩·검색이 읽음)
 * - geo/world.json → public/geo/world.json (다른 나라 지도를 처음 열 때)
 * - geo/c/<ISO3>.json → public/geo/c/<ISO3>.json (그 나라를 고를 때 하나만 지연 로드)
 * 내용은 바꾸지 않는다(Natural Earth v5.1.2 공공 영역 · tz 표는 목업 머리 주석 출처).
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const argv = process.argv.slice(2);
const i = argv.indexOf("--mockup");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const mockup = path.resolve(i >= 0 ? argv[i + 1] : process.env.MOCKUP_DIR ?? path.join(root, "..", "fe-src", "mockup"));
const src = path.join(mockup, "geo");
const dest = path.join(root, "public", "geo");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "c"), { recursive: true });

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(src, "countries.js"), "utf8"), ctx);
const list = ctx.window.EM_COUNTRIES;
if (!Array.isArray(list) || list.length < 200) throw new Error("EM_COUNTRIES 를 못 읽음");
fs.writeFileSync(path.join(dest, "countries.json"), JSON.stringify(list));
fs.copyFileSync(path.join(src, "world.json"), path.join(dest, "world.json"));
let n = 0;
let bytes = 0;
for (const f of fs.readdirSync(path.join(src, "c"))) {
  if (!f.endsWith(".json")) continue;
  fs.copyFileSync(path.join(src, "c", f), path.join(dest, "c", f));
  bytes += fs.statSync(path.join(dest, "c", f)).size;
  n++;
}
console.log(`countries ${list.length} · c/ ${n} 파일 ${bytes} B`);
