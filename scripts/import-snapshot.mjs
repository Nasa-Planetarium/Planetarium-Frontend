#!/usr/bin/env node
/**
 * release 정적 스냅숏 → public/data/snap/ (MSW 가 계약 모양으로 바꿔 응답하는 원천).
 *
 * 쓰는 법: node scripts/import-snapshot.mjs --snap <스냅숏 폴더>   (korea.json · countries.json · world-1deg/ · FORMAT.md)
 *
 * 값은 release data-v1-m2v-2026-11-14 그대로(결정 A1 「모델을 따른다」). 이 스크립트는 복사와 SHA-256 기록만 한다.
 * 전망(outlook.json)이 있으면 함께 복사한다(--outlook <파일>, 없으면 건너뜀). release m2v_meta.json 도 같은 방식(--meta <파일>).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const snap = path.resolve(argOf("--snap") ?? process.env.SNAP_DIR ?? path.join(root, "..", "snap"));
const outlook = argOf("--outlook") ?? process.env.OUTLOOK_FILE;
const dest = path.join(root, "public", "data", "snap");

const FILES = ["korea.json", "countries.json", "FORMAT.md", "world-1deg/grid.bin", "world-1deg/meta.json", "world-1deg/lat-band.json"];
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "world-1deg"), { recursive: true });
/* 원천 위치는 저장소 기준 상대 경로로만 적는다(공개 저장소 — 개인 홈 경로가 커밋되지 않게) */
const manifest = { source: path.relative(root, snap).split(path.sep).join("/"), files: {} };
for (const f of FILES) {
  const from = path.join(snap, f);
  if (!fs.existsSync(from)) {
    if (f === "FORMAT.md") continue;
    throw new Error(`스냅숏 파일 없음: ${from}`);
  }
  fs.copyFileSync(from, path.join(dest, f));
  const buf = fs.readFileSync(from);
  manifest.files[f] = { bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
}
if (outlook && fs.existsSync(outlook)) {
  fs.copyFileSync(outlook, path.join(dest, "outlook.json"));
  const buf = fs.readFileSync(outlook);
  manifest.files["outlook.json"] = { bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
} else {
  manifest.outlook = "없음 — 전망 파일이 만들어지면 --outlook 으로 다시 돌린다";
}
/* release m2v_meta.json(/methods/current 의 meta) — --meta <파일>, 없으면 건너뜀 */
const metaFile = argOf("--meta") ?? process.env.META_FILE;
if (metaFile && fs.existsSync(metaFile)) {
  fs.copyFileSync(metaFile, path.join(dest, "m2v_meta.json"));
  const buf = fs.readFileSync(metaFile);
  manifest.files["m2v_meta.json"] = { bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
} else {
  manifest.meta = "없음 — --meta <m2v_meta.json> 으로 다시 돌린다(/methods/current meta 가 비게 된다)";
}
fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.entries(manifest.files).map(([f, v]) => `${f} ${v.bytes} B`).join(" · "), manifest.outlook ?? "");
