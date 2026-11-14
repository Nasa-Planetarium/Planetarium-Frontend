#!/usr/bin/env node
/**
 * 목업 data.js 의 경북 시나리오 원장 → src/shared/mock/agency/ledger.json
 *
 * 쓰는 법: node scripts/import-ledger.mjs --mockup <목업 폴더>
 *
 * 이 원장은 **보여주기용 목(mock)** 이다(결정 F4·F5): 기관 연동(경보·출동·자원·필지·지휘 통계)과 머리줄 위험지수·기상은
 * 실제 데이터가 아니다. 그래서 목 모듈(src/shared/mock/agency) 안에만 둔다 — 다른 곳에서 import 하면 검사가 실패한다.
 * 실제 데이터(release) 관련 칸(calendar_model · provenance)은 옮기지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const argv = process.argv.slice(2);
const i = argv.indexOf("--mockup");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const mockup = path.resolve(i >= 0 ? argv[i + 1] : process.env.MOCKUP_DIR ?? path.join(root, "..", "fe-src", "mockup"));

const ctx = { window: {} };
ctx.EM = ctx.window.EM = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(mockup, "data.js"), "utf8"), ctx);
const L = ctx.EM.bundle?.internal?.ledger;
if (!L) throw new Error("data.js 에서 EM.bundle.internal.ledger 를 못 찾음");

const KEEP = [
  "today", "now", "season", "aoi", "bounds", "regions", "coast", "rivers", "roads",
  "weather", "risk_index", "fire_records_meta", "fires", "units", "alerts", "simulation", "accounts",
];
const out = { _source: "planetarium-mockup/data.js EM.bundle.internal.ledger (목 · 데모 데이터, 실제 통계·인물 아님)" };
for (const k of KEEP) if (k in L) out[k] = L[k];
const dest = path.join(root, "src", "shared", "mock", "agency", "ledger.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
console.log(`ledger.json: ${KEEP.filter((k) => k in L).join(",")} · 경보 ${L.alerts.length} · 불 ${L.fires.length} · 자원 ${L.units.length}`);
