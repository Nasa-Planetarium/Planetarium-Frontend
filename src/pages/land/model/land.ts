/**
 * 피해 면적(land) 화면 모델 — 목업 pages/land.js 의 목록·단계·이력·요청 규칙을 순수 함수로.
 * 데이터는 AgencyPort(listFires · listParcels)에서만 온다. 이 파일은 값을 만들지 않고 원장 값을 읽어 묶기만 한다.
 */
import type { Fire, Parcel } from "@/shared/agency";

export type Jimok = "forest" | "paddy" | "field" | "site";
export type Owner = "national" | "public" | "private";
export type CoverKey = "forest" | "farm" | "grass" | "urban";
export type Level = 1 | 2 | 3;

export interface LandFire extends Fire {
  burned_ha: number;
  contained_at?: string;
  cause?: string;
  landcover?: Partial<Record<CoverKey, number>>;
  ownership?: Partial<Record<Owner, number>>;
  by_region?: Record<string, number>;
}

export interface FireMeta {
  stage: number;
  queued: boolean;
  fresh: boolean;
  big: boolean;
  total: number;
  burn_poly: [number, number][];
  region_names: Record<string, string>;
}

export interface ParcelRow {
  id: string;
  fire_id: string;
  place: string;
  place_rid: string | null;
  mtn: boolean;
  lot: string;
  jimok: Jimok;
  owner: Owner;
  area: number;
  dmg: Level;
  prio: Level;
}

export const isLandFire = (f: Fire): f is LandFire => typeof (f as { burned_ha?: unknown }).burned_ha === "number";

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const lvl = (v: unknown): Level => (v === 1 || v === 2 || v === 3 ? v : 3);

/** 포트 행(Parcel 자유 필드) → 화면 행 + 불 단위 값. 모르는 모양이면 기본값(빈 다각형 등) */
export function readParcels(list: Parcel[]): { rows: ParcelRow[]; meta: FireMeta | null } {
  const rows = list.map(
    (p): ParcelRow => ({
      id: p.id,
      fire_id: p.fire_id,
      place: str(p.place),
      place_rid: typeof p.place_rid === "string" ? p.place_rid : null,
      mtn: p.mtn === true,
      lot: str(p.lot),
      jimok: (["forest", "paddy", "field", "site"] as const).find((j) => j === p.jimok) ?? "forest",
      owner: (["national", "public", "private"] as const).find((o) => o === p.owner) ?? "private",
      area: num(p.area),
      dmg: lvl(p.dmg),
      prio: lvl(p.prio),
    }),
  );
  const m = list[0]?.fire_meta as Partial<FireMeta> | undefined;
  const meta: FireMeta | null = m
    ? {
        stage: num(m.stage, 1),
        queued: m.queued === true,
        fresh: m.fresh === true,
        big: m.big === true,
        total: num(m.total, rows.length),
        burn_poly: Array.isArray(m.burn_poly) ? m.burn_poly : [],
        region_names: m.region_names && typeof m.region_names === "object" ? m.region_names : {},
      }
    : null;
  return { rows, meta };
}

/* ── 화면 상태(사용자 행동) — 목업 S 와 EM.state.landQueue 몫 ── */
export type TabKey = "s0" | "s1" | "s2" | "s3" | "hist";
export const STAGE_KEYS = ["s0", "s1", "s2", "s3"] as const;
export type Pane = "list" | "detail" | "parcels";

export interface LogRow {
  at: string;
  ts: string;
  stage?: number;
  /** 사전 키 + 값 — 지금 언어로 읽을 때 만든다 */
  key: string;
  params?: Record<string, string | number>;
  by: "system" | "role";
}

export interface LandUi {
  /** 사용자가 옮긴 단계(씨앗 위에 덮는다) */
  stage: Record<string, number>;
  /** 산정 대기에서 넘긴 불 */
  dequeued: string[];
  /** 「새로 들어옴」을 사용자가 다룬 불 */
  settled: string[];
  /** 덧붙은 처리 이력(씨앗 이력 뒤) */
  logs: Record<string, LogRow[]>;
  /** 불마다 고른 필지(처음 = 1순위 필지) */
  checked: Record<string, string[]>;
  /** 필지 우선순위 덮기 */
  prio: Record<string, Level>;
  /** 현장 확인 요청한 필지 */
  req: string[];
  sel: string | null;
  cnt: TabKey | null;
  pane: Pane;
  layers: { burns: boolean; hot: boolean; bounds: boolean };
}

export const initialUi = (): LandUi => ({
  stage: {},
  dequeued: [],
  settled: [],
  logs: {},
  checked: {},
  prio: {},
  req: [],
  sel: null,
  cnt: null,
  pane: "list",
  layers: { burns: true, hot: true, bounds: true }, // 핫스팟 기본 켬: 목업은 꺼 두었으나(land.js:48) 실제 감지가 지도에 보여야 한다는 사용자 지적(2026-11-15)
});

export const isQueued = (f: LandFire, meta: FireMeta | undefined, ui: LandUi) => !!meta?.queued && !ui.dequeued.includes(f.id);
export function stageOf(f: LandFire, meta: FireMeta | undefined, ui: LandUi): number {
  if (isQueued(f, meta, ui)) return 0;
  return ui.stage[f.id] ?? (meta && meta.stage > 0 ? meta.stage : 1);
}
export const tabOf = (f: LandFire, meta: FireMeta | undefined, ui: LandUi): TabKey =>
  f.historical ? "hist" : (STAGE_KEYS[stageOf(f, meta, ui)] ?? "s1");
export const isFresh = (f: LandFire, meta: FireMeta | undefined, ui: LandUi) => !!meta?.fresh && isQueued(f, meta, ui) && !ui.settled.includes(f.id);

const recentKey = (f: LandFire) => f.contained_at ?? f.detected_at;
export type Lists = Record<TabKey, LandFire[]>;

/** 목록 묶음(목업 lists): 산정 대기 = 대기열 순서, 단계 1–3 = 최근 진화 순, 과거 산불 = 원장 순 */
export function lists(fires: LandFire[], metas: Record<string, FireMeta>, ui: LandUi): Lists {
  const L: Lists = { s0: [], s1: [], s2: [], s3: [], hist: [] };
  fires.forEach((f) => {
    if (f.historical) L.hist.push(f);
    else L[STAGE_KEYS[stageOf(f, metas[f.id], ui)] ?? "s1"].push(f);
  });
  (["s1", "s2", "s3"] as const).forEach((k) => L[k].sort((a, b) => recentKey(b).localeCompare(recentKey(a))));
  return L;
}
export const allOf = (L: Lists) => [...L.s0, ...L.s1, ...L.s2, ...L.s3, ...L.hist];

/* ── 시각 ── */
const pad2 = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD HH:MM" ↔ 분(시간대 없이 원장 시각 그대로) */
export function tsMin(ts: string): number {
  const [y, m, d] = ts.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [hh, mm] = (ts.slice(11, 16) || "00:00").split(":").map(Number) as [number, number];
  return Date.UTC(y, m - 1, d, hh, mm) / 60000;
}
export function minTs(m: number): string {
  const d = new Date(m * 60000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
/** 시나리오 시계(epoch ms) → 원장 표기 "YYYY-MM-DD HH:MM"(그 시간대) */
export function ledgerTs(ms: number, offsetMin: number): string {
  return minTs(Math.floor(ms / 60000) + offsetMin);
}
const atOf = (ts: string, hist: boolean) => (hist ? ts.slice(2, 10) : ts.slice(5, 16));
/** 목록·상세 시각: 오늘이면 시:분, 올해면 월-일, 그 전이면 연-월-일 */
export function when(ts: string | undefined, today: string): string {
  if (!ts) return "";
  if (ts.startsWith(today)) return ts.slice(11, 16);
  if (ts.startsWith(today.slice(0, 4))) return ts.slice(5, 10);
  return ts.slice(0, 10);
}

/** 씨앗 이력(목업 logOf): 등록 1줄 + 지금 단계까지 넘김 줄. 원장 단계로 결정적 */
export function seedLog(f: LandFire, seedStage: number, nowTs: string): LogRow[] {
  const t = recentKey(f);
  const hist = !!f.historical;
  const rows: LogRow[] = [{ at: atOf(t, hist), ts: t, stage: 0, key: f.contained_at ? "land.log.queued" : "land.log.queued_no_time", by: "system" }];
  if (seedStage) {
    const t0 = tsMin(t);
    const step = Math.max(1, Math.min(hist ? 45 * 1440 : 300, (tsMin(nowTs) - t0) / (seedStage + 1)));
    for (let i = 1; i <= seedStage; i++) {
      const ts = minTs(Math.round(t0 + step * i));
      rows.push({ at: atOf(ts, hist), ts, stage: i, key: "land.log.moved", params: { stage: i }, by: "role" });
    }
  }
  return rows;
}

/** 단계별 시각(복구 단계 띠 아래 날짜): 그 단계로 넘어간 이력의 날짜(산정 대기 = 등록) */
export function stageAt(logs: LogRow[], i: number): string {
  const hit = i === 0 ? logs[0] : [...logs].reverse().find((l) => l.stage === i);
  return hit ? (hit.at.split(" ")[0] ?? "") : "";
}

/** 첫 선택(목업 start): 산정 대기 → 현장 확인 → 복구 계획 → 복구 중 의 첫 불 */
export const firstPick = (L: Lists) => (L.s0[0] ?? L.s1[0] ?? L.s2[0] ?? L.s3[0])?.id ?? null;

/** 축구장 1면(ha) */
export const PITCH_HA = 0.714;
export const r1 = (n: number) => Math.round(n * 10) / 10;
