#!/usr/bin/env node
/**
 * 목업 사전(i18n/{ko,en}/*.js) → next-intl messages JSON 변환.
 *
 * 쓰는 법: node scripts/import-i18n.mjs --mockup <목업 폴더>   (기본: 환경 변수 MOCKUP_DIR 또는 ../fe-src/mockup)
 *
 * 규칙(설계 frontend-design.md §6.3):
 *  1. 키 문자열은 한 글자도 바꾸지 않는다. 화면 코드는 목업과 같은 키로 t("shell.top.risk") 를 부른다.
 *  2. next-intl 은 점(.)을 중첩으로 읽으므로 평면 키를 중첩 JSON 으로 바꾼다.
 *  3. 점 접두사 충돌(「shell.top.risk」 잎이면서 「shell.top.risk.short」 의 가지) → 잎을 「<키>._」 로 옮긴다.
 *     src/shared/i18n/use-t.ts 의 t() 가 「x」 를 찾을 때 「x._」 를 먼저 본다(코드 키 불변).
 *  4. 복수형 객체 {one, other} → ICU {n, plural, one {…} other {…}}.
 *  5. ICU 이스케이프: 작은따옴표 ' → '' (ICU 에서 '' = 글자 ' 하나).
 *  6. 묶음(shell·data·home …)마다 messages/<lang>/<묶음>.json, 목록은 messages/bundles.json, 정적 import 표는 messages/index.ts.
 *  7. 보고: messages/_import-report.json (키 수·충돌·복수형·따옴표·en 에만/ko 에만 있는 키).
 *
 * 목업 사전 파일은 브라우저 스크립트(EM.i18n.add(lang, bundle, {…}))라 node:vm 의 빈 문맥에서 실행해 값만 받는다.
 * 목업 파일은 읽기만 한다.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const mockup = path.resolve(argOf("--mockup") ?? process.env.MOCKUP_DIR ?? path.join(root, "..", "fe-src", "mockup"));
const outDir = path.join(root, "messages");
const LANGS = ["ko", "en"];

function loadLang(lang) {
  const dir = path.join(mockup, "i18n", lang);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
  const bundles = {};
  for (const f of files) {
    const added = [];
    const ctx = { EM: { i18n: { add: (l, b, dict) => added.push({ l, b, dict }) } } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
    for (const { l, b, dict } of added) {
      if (l !== lang) throw new Error(`${f}: 언어 ${l} ≠ 폴더 ${lang}`);
      bundles[b] = Object.assign(bundles[b] ?? {}, dict);
    }
  }
  return bundles;
}

const icuEscape = (s) => String(s).replace(/'/g, "''");

function toIcu(v, stats, key) {
  if (typeof v === "string") {
    if (v.includes("'")) stats.apostrophes.push(key);
    return icuEscape(v);
  }
  if (v && typeof v === "object" && ("one" in v || "other" in v)) {
    stats.plurals.push(key);
    const forms = Object.entries(v)
      .map(([form, text]) => `${form} {${icuEscape(String(text).replace(/#/g, "'#'"))}}`)
      .join(" ");
    return `{n, plural, ${forms}}`;
  }
  throw new Error(`알 수 없는 값 모양: ${key} = ${JSON.stringify(v)}`);
}

/** 원래 평면 키 목록으로 되돌리기 — 키가 하나도 안 바뀌었는지 시험용 */
function flatten(obj, prefix = "", acc = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = k === "_" ? prefix : prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") acc.push(key);
    else flatten(v, prefix ? `${prefix}.${k}` : k, acc);
  }
  return acc;
}

const report = { mockup, generated_at: new Date().toISOString(), langs: {} };
const allKeys = {};
fs.mkdirSync(outDir, { recursive: true });
const bundleNames = new Set();
for (const lang of LANGS) {
  const bundles = loadLang(lang);
  const dir = path.join(outDir, lang);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const stats = { keys: 0, bundles: {}, conflicts: [], plurals: [], apostrophes: [] };
  // 묶음 사이 충돌을 보려고 언어 전체로 한 번 더 모은다
  const flatAll = {};
  for (const dict of Object.values(bundles)) Object.assign(flatAll, dict);
  const branchAll = new Set();
  for (const k of Object.keys(flatAll)) {
    const parts = k.split(".");
    for (let i = 1; i < parts.length; i++) branchAll.add(parts.slice(0, i).join("."));
  }
  for (const [b, dict] of Object.entries(bundles)) {
    bundleNames.add(b);
    const s = { conflicts: [], plurals: [], apostrophes: [] };
    // 묶음 밖 키가 가지인 경우까지 잡도록 언어 전체 가지 집합을 쓴다
    const nested = nestWith(dict, s, branchAll);
    fs.writeFileSync(path.join(dir, `${b}.json`), JSON.stringify(nested, null, 1) + "\n");
    const back = flatten(nested);
    const src = Object.keys(dict).sort();
    if (back.sort().join("\n") !== src.join("\n")) throw new Error(`${lang}/${b}: 왕복 키 불일치`);
    stats.bundles[b] = src.length;
    stats.keys += src.length;
    stats.conflicts.push(...s.conflicts);
    stats.plurals.push(...s.plurals);
    stats.apostrophes.push(...s.apostrophes);
  }
  allKeys[lang] = new Set(Object.keys(flatAll));
  report.langs[lang] = {
    keys: stats.keys,
    bundles: stats.bundles,
    conflicts_n: stats.conflicts.length,
    conflicts: stats.conflicts,
    plurals_n: stats.plurals.length,
    plurals: stats.plurals,
    apostrophes_n: stats.apostrophes.length,
    apostrophes: stats.apostrophes,
  };
}

function nestWith(flat, stats, branchAll) {
  const out = {};
  for (const k of Object.keys(flat).sort()) {
    const conflict = branchAll.has(k);
    if (conflict) stats.conflicts.push(k);
    const parts = conflict ? [...k.split("."), "_"] : k.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof node[p] === "string") {
        // 잎이 먼저 들어간 뒤 같은 이름 가지가 오면 잎을 「_」 로 내린다
        node[p] = { _: node[p] };
      }
      node = node[p] ??= {};
    }
    const leaf = parts[parts.length - 1];
    if (node[leaf] && typeof node[leaf] === "object") node[leaf]._ = toIcu(flat[k], stats, k);
    else node[leaf] = toIcu(flat[k], stats, k);
  }
  return out;
}

const onlyEn = [...allKeys.en].filter((k) => !allKeys.ko.has(k));
const onlyKo = [...allKeys.ko].filter((k) => !allKeys.en.has(k));
report.only_en_n = onlyEn.length;
report.only_ko_n = onlyKo.length;
report.only_en = onlyEn.sort();
report.only_ko = onlyKo.sort();
const names = [...bundleNames].sort();
fs.writeFileSync(path.join(outDir, "bundles.json"), JSON.stringify(names) + "\n");
// 정적 import 표(번들러가 경로를 미리 알 수 있게) — src/shared/i18n/messages.ts 가 읽는다
const loaderOf = (lang) =>
  `  ${lang}: () =>\n    Promise.all([\n${names.map((b) => `      import("./${lang}/${b}.json"),`).join("\n")}\n    ]).then((m) => m.map((x) => x.default as Record<string, unknown>)),`;
fs.writeFileSync(
  path.join(outDir, "index.ts"),
  `// 자동 생성 — scripts/import-i18n.mjs. 손으로 고치지 말 것.\nexport const BUNDLES = ${JSON.stringify(names)} as const;\nexport const loaders = {\n${LANGS.map(loaderOf).join("\n")}\n} as const;\n`,
);
fs.writeFileSync(path.join(outDir, "_import-report.json"), JSON.stringify(report, null, 1) + "\n");
for (const lang of LANGS) {
  const r = report.langs[lang];
  console.log(`${lang}: 키 ${r.keys} · 묶음 ${Object.keys(r.bundles).length} · 충돌 ${r.conflicts_n} · 복수형 ${r.plurals_n} · 따옴표 ${r.apostrophes_n}`);
}
console.log(`en 에만 ${onlyEn.length} · ko 에만 ${onlyKo.length} · 묶음 ${names.join(",")}`);
