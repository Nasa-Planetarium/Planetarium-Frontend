#!/usr/bin/env node
/**
 * 빌드 결과(out/)가 Cloudflare Pages 에 올라갈 수 있는지 + 원하는 데이터 모드로 빌드됐는지 잰다 — 배포 전 문.
 *
 * 잰 것
 *  1. 파일 수 ≤ 20,000 (Pages 정적 자산 한도, 무료 플랜)
 *  2. 파일 하나 ≤ 25 MiB (Pages 파일당 한도)
 *  3. out/_headers 가 있고 규칙 ≤ 100 개, 줄 ≤ 2,000 자 (Pages _headers 한도) — public/_headers 가 복사됐는지
 *  4. --mode 를 주면: 빌드에 박힌 NEXT_PUBLIC_DATA_MODE 값이 그것과 같은지.
 *     src/shared/config/env.ts 의 pick("NEXT_PUBLIC_DATA_MODE", <값>, …) 이 빌드 때 글자로 바뀌어 청크에 남는다 — 그 글자를 읽는다
 *     (환경변수를 줬는지가 아니라 결과물에 무엇이 박혔는지를 잰다).
 *
 * 쓰는 법: node scripts/check-pages-out.mjs [--dir out] [--mode http|msw]   (문제 0 이면 종료 코드 0)
 */
import fs from "node:fs";
import path from "node:path";

export const LIMITS = { files: 20_000, fileBytes: 25 * 1024 * 1024, headerRules: 100, headerLine: 2_000 };
const MODE_RE = /"NEXT_PUBLIC_DATA_MODE",(?:"([a-z]*)"|void 0|undefined)/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** 빌드에 박힌 데이터 모드들(보통 하나). 값 없이 빌드했으면 "(unset → 기본 msw)" */
export function builtModes(dir) {
  const chunks = path.join(dir, "_next", "static");
  if (!fs.existsSync(chunks)) return [];
  const modes = new Set();
  for (const f of walk(chunks)) {
    if (!f.endsWith(".js")) continue;
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(MODE_RE)) modes.add(m[1] || "(unset → 기본 msw)");
  }
  return [...modes];
}

/** @returns {{ problems: string[], stats: { files: number, bytes: number, largest: [string, number] | null, modes: string[] } }} */
export function inspect(dir, { mode } = {}) {
  const problems = [];
  if (!fs.existsSync(dir)) return { problems: [`${dir} 없음 — 먼저 pnpm build`], stats: { files: 0, bytes: 0, largest: null, modes: [] } };
  const files = walk(dir);
  let bytes = 0;
  let largest = null;
  for (const f of files) {
    const n = fs.statSync(f).size;
    bytes += n;
    if (!largest || n > largest[1]) largest = [path.relative(dir, f), n];
    if (n > LIMITS.fileBytes) problems.push(`파일 25 MiB 초과: ${path.relative(dir, f)} (${(n / 1048576).toFixed(1)} MiB)`);
  }
  if (files.length > LIMITS.files) problems.push(`파일 수 ${files.length} > ${LIMITS.files}`);

  const hp = path.join(dir, "_headers");
  if (!fs.existsSync(hp)) problems.push("_headers 없음 — public/_headers 가 out/ 으로 복사되지 않았다");
  else {
    const lines = fs.readFileSync(hp, "utf8").split(/\r?\n/);
    const rules = lines.filter((l) => /^\S/.test(l) && !l.startsWith("#")).length;
    if (rules > LIMITS.headerRules) problems.push(`_headers 규칙 ${rules} > ${LIMITS.headerRules}`);
    const long = lines.findIndex((l) => l.length > LIMITS.headerLine);
    if (long >= 0) problems.push(`_headers ${long + 1}째 줄이 ${LIMITS.headerLine} 자 초과`);
  }

  const modes = builtModes(dir);
  if (mode) {
    if (modes.length === 0) problems.push("빌드에서 NEXT_PUBLIC_DATA_MODE 자리를 못 찾음 — env.ts 모양이 바뀌었으면 이 검사기도 고친다");
    else if (modes.length > 1 || modes[0] !== mode) problems.push(`데이터 모드: 원한 것 ${mode}, 빌드에 박힌 것 ${modes.join(", ")}`);
  }
  return { problems, stats: { files: files.length, bytes, largest, modes } };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : d;
  };
  const dir = path.resolve(arg("--dir", "out"));
  const mode = arg("--mode", undefined);
  const { problems, stats } = inspect(dir, { mode });
  const mib = (n) => (n / 1048576).toFixed(1);
  console.log(
    `out: 파일 ${stats.files} / ${LIMITS.files} · 합계 ${mib(stats.bytes)} MiB · 가장 큰 파일 ${stats.largest ? `${stats.largest[0]} ${mib(stats.largest[1])} MiB` : "-"} / 25 MiB · 데이터 모드 ${stats.modes.join(", ") || "-"}`,
  );
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) process.exit(1);
  console.log("✓ Pages 한도 안 · 모드 일치");
}
