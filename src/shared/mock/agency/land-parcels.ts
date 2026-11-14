/**
 * 피해 면적(land) 목 생성기 — 목업 pages/land.js 의 필지 생성(parcels)·복구 단계 씨앗(S.stage)·산정 대기열(mock/agency.js landQueue)
 * 과 core.js 의 소실 범위 다각형(EM.burnShape, 단일 시군 판)을 옮겼다. 결정적(같은 불 → 같은 필지·같은 다각형).
 *
 * ⚠ 격리 규칙(F5): 이 파일은 목 폴더 안에서만 쓰인다(어댑터 listParcels 가 부른다). 화면은 AgencyPort.listParcels 만 안다.
 * 포트 모양(Parcel = { id, fire_id, …자유 필드 })을 바꾸지 않으려고, 불 단위 값(복구 단계 씨앗·대기 여부·새로 들어옴·대표 필지 추정 수·소실 다각형)은
 * 행마다 `fire_meta` 로 같이 싣는다.
 */
import type { Alert, Fire, Parcel } from "../../agency/port";

/* ── 결정적 난수(목업 core.js hash·rng 그대로) ── */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 필지 지번용 예시 마을(실제 필지 아님) — 원문은 사전 키(land.place.<원문>) */
const VILLAGES: Record<string, string[]> = {
  andong: ["길안면 묵계리", "임하면 고곡리", "남후면 고하리", "길안면 금곡리"],
  uiseong: ["점곡면 윤암리", "옥산면 신계리", "단촌면 구계리", "점곡면 사촌리"],
  cheongsong: ["파천면 신기리", "진보면 부곡리", "파천면 중평리"],
  yeongyang: ["일월면 도곡리", "석보면 삼의리"],
  yeongdeok: ["지품면 삼화리", "지품면 오천리", "영덕읍 화수리"],
  yecheon: ["용궁면 무이리", "용궁면 향석리"],
  "H-2004-AD": ["풍천면 인금리", "풍천면 갈전리", "풍천면 어담리"],
};

/** 복구 단계 씨앗(목업 land.js S.stage) — 0 산정 대기 · 1 현장 확인 · 2 복구 계획 · 3 복구 중 */
const STAGE_SEED: Record<string, number> = { "F-261110-02": 2, "F-261108-01": 1, "F-261110-01": 3, "H-2503-UI": 3, "H-2004-AD": 3 };

const COVER = ["forest", "farm", "grass", "urban"] as const;
type CoverKey = (typeof COVER)[number];

export type Jimok = "forest" | "paddy" | "field" | "site";
export type Owner = "national" | "public" | "private";

export interface LandFireMeta {
  /** 복구 단계 씨앗(대기열에 있으면 0) */
  stage: number;
  /** 산정 대기열에 있음(진화가 끝난 오늘 불) */
  queued: boolean;
  /** 토지 담당 미읽음 알림이 있는 대기 불 = 「새로 들어옴」 */
  fresh: boolean;
  /** 대형 산불(60 ha 초과): 표는 면적 큰 대표 필지만 */
  big: boolean;
  /** 전체 필지 수(대형은 ha/3.1 추정) */
  total: number;
  /** 소실 범위 추정 다각형 [lat, lon][] */
  burn_poly: [number, number][];
  /** 시군 id → 원장 이름(한국어 원문, 사전에 없을 때 쓴다) — 시군별 면적·「{시군} 일원」 */
  region_names: Record<string, string>;
}

interface LandParcelBase {
  id: string;
  fire_id: string;
  cls: CoverKey;
  /** 마을 원문(사전 land.place.<원문>) 또는 시군 id(대형 산불 「{시군} 일원」) */
  place: string;
  place_rid: string | null;
  mtn: boolean;
  lot: string;
  jimok: Jimok;
  owner: Owner;
  area: number;
  dmg: 1 | 2 | 3;
  prio: 1 | 2 | 3;
}
export type LandParcel = Parcel & LandParcelBase & { fire_meta: LandFireMeta };

/* ── 소실 범위 다각형(목업 EM.burnShape 의 단일 시군 판: 북동으로 기운 타원 + 결정적 요철, 넓이 = burned_ha) ── */
function polyAreaKm2(rad: number[], n: number): number {
  let A = 0;
  for (let i = 0; i < n; i++) A += 0.5 * (rad[i] ?? 0) * (rad[(i + 1) % n] ?? 0) * Math.sin((Math.PI * 2) / n);
  return A;
}
export function burnShape(f: Pick<Fire, "id" | "lat" | "lon"> & { burned_ha?: number | null }): [number, number][] {
  if (!f.burned_ha) return [];
  const R = rng(`burn:${f.id}`);
  const kx = Math.cos((f.lat * Math.PI) / 180);
  const target = f.burned_ha / 100; // km²
  const n = 72;
  let rad: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    rad.push(1 + 0.45 * Math.cos(a + Math.PI / 4));
  }
  rad = rad.map((x) => x * (0.88 + R() * 0.24));
  const k = Math.sqrt(target / polyAreaKm2(rad, n));
  rad = rad.map((x) => x * k);
  return rad.map((rr, i) => {
    const a = (i / n) * Math.PI * 2;
    return [f.lat + (Math.sin(a) * rr) / 111, f.lon + (Math.cos(a) * rr) / (111 * kx)];
  });
}

type LandFire = Fire & {
  burned_ha?: number | null;
  current?: boolean;
  landcover?: Partial<Record<CoverKey, number>>;
  ownership?: Partial<Record<Owner, number>>;
  by_region?: Record<string, number>;
};

/** 산정 대기열 씨앗(목업 mock/agency.js): 오늘 원장에서 진화가 끝난(contained) 불 */
export const isQueued = (f: LandFire) => f.status === "contained" && !!f.current;

/** 불 하나의 필지(목업 land.js parcels 그대로). 소실 면적이 없으면 빈 배열 */
export function landParcels(fire: Fire, alerts: Alert[], regions: { id: string; name: string }[] = []): LandParcel[] {
  const f = fire as LandFire;
  const ha = f.burned_ha;
  if (ha == null) return [];
  const R = rng(`parcel:${f.id}`);
  const big = ha > 60;
  const n = big ? 14 : Math.max(3, Math.min(12, Math.round(2 + Math.sqrt(ha) * 2.2)));
  const own = { national: f.ownership?.national ?? 0, public: f.ownership?.public ?? 0, private: f.ownership?.private ?? (f.ownership ? 0 : ha) };
  const ownTot = own.national + own.public + own.private || 1;

  let places: string[] | null;
  if (VILLAGES[f.id]) places = VILLAGES[f.id] ?? null;
  else if (f.by_region) places = null;
  else {
    const p = f.name.split(" ").slice(1, 3).join(" ");
    places = [p].concat((VILLAGES[f.region] ?? []).filter((v) => v !== p));
  }
  const pickPlace = (): { place: string; rid: string | null } => {
    if (places) {
      const p = R() < 0.62 ? places[0] : places[1 + Math.floor(R() * (places.length - 1))] || places[0];
      return { place: p ?? "", rid: null };
    }
    const byR = f.by_region ?? {};
    const regs = Object.keys(byR);
    const tot = regs.reduce((s, k) => s + (byR[k] ?? 0), 0);
    let x = R() * tot;
    let rid = regs[0] ?? f.region;
    for (const k of regs) {
      x -= byR[k] ?? 0;
      if (x <= 0) {
        rid = k;
        break;
      }
    }
    const pool = VILLAGES[rid];
    if (pool) return { place: pool[Math.floor(R() * pool.length)] ?? "", rid: null };
    R();
    return { place: rid, rid };
  };

  const lc: Record<CoverKey, number> = f.landcover
    ? { forest: f.landcover.forest ?? 0, farm: f.landcover.farm ?? 0, grass: f.landcover.grass ?? 0, urban: f.landcover.urban ?? 0 }
    : { forest: ha, farm: 0, grass: 0, urban: 0 };
  const classes = COVER.filter((c) => lc[c] > 0).map((c) => ({ k: c, v: lc[c] }));
  const lcTot = classes.reduce((s, c) => s + c.v, 0) || 1;
  const assign: CoverKey[] = classes.map((c) => c.k);
  while (assign.length < n) {
    let x = R() * lcTot;
    let k = classes[0]?.k ?? "forest";
    for (const c of classes) {
      x -= c.v;
      if (x <= 0) {
        k = c.k;
        break;
      }
    }
    assign.push(k);
  }
  const JIMOK_OF: Record<CoverKey, () => Jimok> = { forest: () => "forest", grass: () => "forest", farm: () => (R() < 0.55 ? "paddy" : "field"), urban: () => "site" };
  type Row = LandParcelBase & { w: number };
  const rows: Row[] = assign.map((k, i) => {
    const jimok = JIMOK_OF[k]();
    const pp = pickPlace();
    const mtn = jimok === "forest";
    const lot = `${mtn ? 1 + Math.floor(R() * 160) : 100 + Math.floor(R() * 880)}-${1 + Math.floor(R() * 14)}`;
    let owner: Owner = "private";
    if (mtn) {
      let x = R() * ownTot;
      owner = (x -= own.national) <= 0 ? "national" : (x -= own.public) <= 0 ? "public" : "private";
    } else if (R() < 0.12) owner = "public";
    const sev = Math.min(0.75, f.frp_max / 220 + 0.18);
    const roll = R();
    const dmg: 1 | 2 | 3 = roll < sev ? 3 : roll < sev + 0.32 ? 2 : 1;
    const prio: 1 | 2 | 3 = dmg === 3 ? 1 : dmg === 2 ? 2 : 3;
    return { id: `${f.id}-${i}`, fire_id: f.id, cls: k, place: pp.place, place_rid: pp.rid, mtn, lot, jimok, owner, w: Math.pow(R(), 1.3) + 0.18, area: 0, dmg, prio };
  });
  if (big) {
    // 대형 산불: 대표 필지 6–58 ha, 합이 총면적 12% 를 넘으면 같은 비율로 줄인다
    rows.forEach((p) => (p.area = 6 + p.w * 44));
    const raw = rows.reduce((s, p) => s + p.area, 0);
    const cap = ha * 0.12;
    const k = raw > cap ? cap / raw : 1;
    rows.forEach((p) => (p.area = Math.max(0.1, Math.floor(p.area * k * 10) / 10)));
  } else {
    // 최대 나머지 방식: 0.01 ha 단위로 나눠 필지 합 = 소실 면적
    const units = Math.round(ha * 100);
    const raw: { p: Row; v: number; u: number }[] = [];
    classes.forEach((c) => {
      const grp = rows.filter((p) => p.cls === c.k);
      const wt = grp.reduce((s, p) => s + p.w, 0);
      grp.forEach((p) => raw.push({ p, v: ((c.v / lcTot) * units * p.w) / wt, u: 0 }));
    });
    raw.forEach((r) => (r.u = Math.max(1, Math.floor(r.v))));
    let left = units - raw.reduce((s, r) => s + r.u, 0);
    const byRem = raw.slice().sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || b.v - a.v);
    for (let i = 0; left > 0 && byRem.length; i = (i + 1) % byRem.length) {
      const r = byRem[i];
      if (r) r.u++;
      left--;
    }
    const byBig = raw.slice().sort((a, b) => b.u - a.u);
    for (let i = 0; left < 0 && i < byBig.length * 4; i++) {
      const r = byBig[i % byBig.length];
      if (r && r.u > 1) {
        r.u--;
        left++;
      }
    }
    raw.forEach((r) => (r.p.area = r.u / 100));
  }
  rows.sort((a, b) => b.area - a.area);

  const queued = isQueued(f);
  const fresh = queued && alerts.some((a) => a.fire_id === f.id && a.targets.includes("land"));
  const meta: LandFireMeta = {
    stage: queued ? 0 : (STAGE_SEED[f.id] ?? 1),
    queued,
    fresh,
    big,
    total: big ? Math.round(ha / 3.1) : rows.length,
    burn_poly: burnShape(f),
    region_names: Object.fromEntries(regions.map((r) => [r.id, r.name])),
  };
  return rows.map((p) => {
    const { w, ...rest } = p;
    void w;
    return { ...rest, fire_meta: meta };
  });
}
