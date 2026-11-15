#!/usr/bin/env node
/**
 * 공개 저장소 내부 정보 검사 — 이 저장소는 공개라서, 팀 안쪽에서만 뜻이 있는 값이 커밋되면 그대로 세상에 나간다.
 *
 * 잡는 것(규칙 4개, 추적되는 파일 전부 · 이진 파일과 lock 파일 제외)
 *  ip    내부망 주소(192.168.x.x)
 *  home  리눅스 홈 경로(/home/<사용자>) — 앞이 경로 글자면(예: src/pages/home/ui) 홈 경로가 아니라 거른다
 *  host  팀 시험 서버의 호스트 이름
 *  port  내부 포트(18000–19999 번) — JSON 키 뒤 숫자("area_km2":18234)는 포트가 아니라 거른다
 *
 * 예외: scripts/public-leaks-allow.txt — 한 줄에 `<경로>`(파일 전체) 또는 `<경로> <잡힌 글자 그대로>`. # 뒤는 주석.
 *       예외를 넣을 때는 그 값이 왜 공개돼도 되는지 바로 위 주석에 적는다.
 *
 * 쓰는 법: node scripts/check-public-leaks.mjs             (잡힌 곳 0 이면 종료 코드 0, 있으면 1)
 *          node scripts/check-public-leaks.mjs --self-test (가짜 값을 넣어 규칙이 실제로 잡고·거르는지 잰다)
 * 값이 동작에 필요하면(주소·포트·경로) 코드에 박지 말고 환경 변수로 받는다 — README 「공개 저장소 검사」.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/* 호스트 이름은 이 파일 자체가 잡히지 않게 나눠 쓴다 */
const HOST = ["ai", "box"].join("");

export const RULES = [
  { id: "ip", re: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g },
  { id: "home", re: /(?<![\w.~@/-])\/home\/[a-z_][a-z0-9_-]*/g },
  { id: "host", re: new RegExp(`\\b${HOST}\\b`, "gi") },
  { id: "port", re: /(?<!"):1[89]\d{3}(?![\d.])/g },
];

const SKIP = [/(^|\/)pnpm-lock\.yaml$/, /\.lock$/, /^scripts\/public-leaks-allow\.txt$/];

/** 글 한 덩어리 → 잡힌 곳 [{ line, rule, text }] */
export function scanText(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const r of RULES) {
      r.re.lastIndex = 0;
      for (const m of lines[i].matchAll(r.re)) out.push({ line: i + 1, rule: r.id, text: m[0] });
    }
  }
  return out;
}

/** 예외 파일 글 → { files:Set<경로>, pairs:Set<"경로 글자"> } */
export function parseAllow(text) {
  const files = new Set();
  const pairs = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.replace(/#.*$/, "").trim();
    if (!s) continue;
    const sp = s.indexOf(" ");
    if (sp < 0) files.add(s);
    else pairs.add(`${s.slice(0, sp)} ${s.slice(sp + 1).trim()}`);
  }
  return { files, pairs };
}

function trackedFiles(root) {
  const buf = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  return buf.toString("utf8").split("\0").filter(Boolean);
}

function run(root) {
  const allowPath = path.join(root, "scripts", "public-leaks-allow.txt");
  const allow = parseAllow(fs.existsSync(allowPath) ? fs.readFileSync(allowPath, "utf8") : "");
  const hits = [];
  let scanned = 0;
  for (const f of trackedFiles(root)) {
    if (SKIP.some((re) => re.test(f)) || allow.files.has(f)) continue;
    const p = path.join(root, f);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    const buf = fs.readFileSync(p);
    if (buf.subarray(0, 8000).includes(0)) continue; // 이진 파일(그림·타일)
    scanned++;
    for (const h of scanText(buf.toString("utf8"))) {
      if (!allow.pairs.has(`${f} ${h.text}`)) hits.push({ file: f, ...h });
    }
  }
  for (const h of hits) console.error(`${h.file}:${h.line} [${h.rule}] ${h.text}`);
  console.log(`check-public-leaks: 파일 ${scanned}개 · 잡힌 곳 ${hits.length}`);
  return hits.length === 0 ? 0 : 1;
}

function selfTest() {
  const must = [
    ["ip", `http://192.${168}.0.7/x`],
    ["home", `"/home/${"someone"}/proj"`],
    ["host", `ssh ${HOST} 에서`],
    ["host", `${HOST.toUpperCase()}`],
    ["port", `localhost:${18490}/api`],
    ["port", `실서버(:${18512} /api/v1)`],
  ];
  const mustNot = [
    `{"area_km2":${18234},"pt":${19517}}`,
    `await page.goto("/ko/home/");`,
    `import x from "@/pages/home/ui";`,
    `src/pages/home/ui/home-map.tsx`,
    `http://localhost:8080`,
    `19:12 KST`,
    `my${HOST}es`,
  ];
  let bad = 0;
  for (const [rule, s] of must) {
    if (!scanText(s).some((h) => h.rule === rule)) (bad++, console.error(`못 잡음 [${rule}]: ${s}`));
  }
  for (const s of mustNot) {
    const h = scanText(s);
    if (h.length) (bad++, console.error(`잘못 잡음 [${h.map((x) => x.rule).join(",")}]: ${s}`));
  }
  console.log(`self-test: 잡아야 할 것 ${must.length} · 걸러야 할 것 ${mustNot.length} · 틀림 ${bad}`);
  return bad === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
  process.exit(process.argv.includes("--self-test") ? selfTest() : run(root));
}
