#!/usr/bin/env node
/**
 * 목(mock) 격리 검사 — 결정 F5 「mock 부분은 격리시켜야지. 추후에 바로 수정할 수 있도록」 · F6(예시 로그인).
 *
 * 규칙
 *  R1. 목 모듈(src/shared/mock/** — 기관 연동 목·예시 로그인 목)을 import 해도 되는 파일은 조립 지점 src/app/boot/adapters.ts 하나.
 *  R2. 목 모듈은 실제 데이터 쪽(src/shared/api · src/shared/msw · src/shared/data-cases · entities·features·widgets·pages·app(src) · app/(경로))을 import 하지 않는다.
 *      허용: 포트 타입(src/shared/agency/port.ts · src/shared/auth/port.ts) · src/shared/config · src/shared/lib · 같은 목 폴더 안 파일.
 *  R3. switch 문 금지(결정 E4) — eslint 와 같은 규칙을 글자로 한 번 더(주석·문자열 안은 거름).
 *
 * 쓰는 법: node scripts/check-isolation.mjs            (위반 0 이면 종료 코드 0)
 *          node scripts/check-isolation.mjs --self-test (가짜 위반을 넣어 검사기가 실제로 잡는지 잰다 — 모양이 아니라 성질 확인)
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

const MOCK = ["src/shared/mock/"];
const COMPOSITION_ROOT = "src/app/boot/adapters.ts";
const MOCK_ALLOWED = ["src/shared/agency/port.ts", "src/shared/auth/port.ts", "src/shared/config/", "src/shared/lib/"];
const isMock = (f) => MOCK.some((m) => f.startsWith(m));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** import 문자열 → 저장소 기준 경로(확장자·index 해석). 패키지 import 는 null */
function resolve(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const cands = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  const hit = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  return rel(hit ?? base);
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const stripStrings = (s) => s.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');

export function check(files) {
  const violations = [];
  let imports = 0;
  for (const { file, text } of files) {
    const f = rel(file);
    const code = stripComments(text);
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      const target = resolve(file, spec);
      if (!target) continue;
      imports++;
      if (isMock(target) && !isMock(f) && f !== COMPOSITION_ROOT) violations.push({ rule: "R1", file: f, spec, target });
      if (isMock(f) && !isMock(target) && !MOCK_ALLOWED.some((a) => target.startsWith(a))) violations.push({ rule: "R2", file: f, spec, target });
    }
    if (/\bswitch\s*\(/.test(stripStrings(code))) violations.push({ rule: "R3", file: f, spec: "switch(", target: "-" });
  }
  return { files: files.length, imports, violations };
}

const load = () => [...walk(path.join(root, "src")), ...walk(path.join(root, "app"))].map((file) => ({ file, text: fs.readFileSync(file, "utf8") }));

function report(r) {
  console.log(`검사 파일 ${r.files} · 내부 import ${r.imports} · 위반 ${r.violations.length}`);
  for (const v of r.violations) console.log(`  ${v.rule} ${v.file}: "${v.spec}" → ${v.target}`);
}

if (process.argv.includes("--self-test")) {
  // 실제 트리 + 가짜 위반 3개(R1·R2·R3)를 메모리에만 넣고, 검사기가 정확히 그 3개를 잡는지 잰다
  const base = load();
  const clean = check(base);
  const fake = [
    { file: path.join(root, "src/widgets/top-bar/ui/__fake_r1.tsx"), text: 'import { MockAgencyAdapter } from "@/shared/mock";' },
    { file: path.join(root, "src/shared/mock/agency/__fake_r2.ts"), text: 'import { api } from "@/shared/api/client";' },
    { file: path.join(root, "src/shared/lib/__fake_r3.ts"), text: "export const f = (x: number) => { switch (x) { default: return 1; } };" },
  ];
  const dirty = check([...base, ...fake]);
  const caught = dirty.violations.filter((v) => v.file.includes("__fake_")).map((v) => v.rule).sort();
  const ok = clean.violations.length === 0 && caught.join(",") === "R1,R2,R3" && dirty.violations.length === 3;
  console.log(`self-test: 깨끗한 트리 위반 ${clean.violations.length} · 가짜 3개 중 잡음 ${caught.length} (${caught.join(",")}) → ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
} else {
  const r = check(load());
  report(r);
  process.exit(r.violations.length ? 1 : 0);
}
