/**
 * 기관 연동 목 어댑터 — 경북 시나리오 원장(ledger.json, 목업 data.js 이식)을 메모리에 두고 AgencyPort 모양으로 낸다.
 *
 * ⚠ 격리 규칙(결정 F5): 이 폴더(src/shared/mock/**)는
 *   - 조립 지점(src/app/boot/adapters.ts)만 import 할 수 있다.
 *   - 실제 데이터 모듈(shared/api/client·msw·data-cases, entities 등)을 import 하지 않는다. 포트 타입(../../agency/port)만 쓴다.
 *   검사: pnpm check:isolation · eslint no-restricted-imports.
 * 목 데이터·생성기(목업 land.js 필지 생성, cmd.js 통계 등)를 옮길 때도 이 폴더 안에만 둔다.
 */
import type {
  AgencyPort,
  Alert,
  CommandQuery,
  CommandStats,
  DispatchResult,
  Fire,
  Parcel,
  Situation,
  Unit,
} from "../../agency/port";
import ledger from "./ledger.json";
import { landParcels } from "./land-parcels";
import { opsAlerts, opsFires, opsHome } from "./ops-scenario";
import { cmdBoard } from "./cmd-board";

const KST_OFFSET_MIN = 9 * 60;

/** "2026-11-11" + "14:20"(Asia/Seoul) → epoch ms. 한국은 서머타임이 없어 고정 +09:00 */
function scenarioNow(today: string, now: string): number {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const [hh, mm] = now.split(":").map(Number) as [number, number];
  return Date.UTC(y, m - 1, d, hh, mm) - KST_OFFSET_MIN * 60000;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const CLOSED = new Set(["contained", "out", "resolved"]);
/** 원장 위험 낱말 → 단계(목업 core.js RISK_LV, 모르면 3) */
const RISK_LV: Record<string, 1 | 2 | 3 | 4> = { 낮음: 1, 보통: 2, 높음: 3, "매우 높음": 4 };

export class MockAgencyAdapter implements AgencyPort {
  readonly kind = "mock" as const;
  private fires: Fire[] = clone(ledger.fires) as Fire[];
  private alerts: Alert[] = clone(ledger.alerts) as Alert[];
  private units: Unit[] = clone(ledger.units) as Unit[];
  private readonly nowMs = scenarioNow(ledger.today, ledger.now);
  /** 목은 네트워크가 없어도 화면이 「불러오는 중」 상태를 한 번 거치도록 아주 짧게 늦춘다 */
  private tick = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(clone(v)), 0));

  getSituation(): Promise<Situation> {
    return this.tick({
      now_ms: this.nowMs,
      tz: "Asia/Seoul",
      weather: ledger.weather,
      risk_index: { ...ledger.risk_index, level: RISK_LV[ledger.risk_index.label] ?? 3 },
      season: ledger.season,
    });
  }
  /** 경보 — ops 필드(첫 이력·처음 미읽음·감지 근거 통과)는 ./ops-scenario.ts 가 덧붙인다 */
  listAlerts() {
    return this.tick(opsAlerts(this.alerts, this.notes));
  }
  /** 불 — ops 필드(반경 2 km 마을·관측 점 신뢰도·고정 열원)는 ./ops-scenario.ts 가 덧붙인다 */
  listFires() {
    return this.tick(opsFires(this.fires, ledger.today));
  }
  /** 자원 — 귀소 자리(home)는 ./ops-scenario.ts */
  listUnits() {
    return this.tick(this.units.map((u) => ({ ...u, home: opsHome(u.id, u.lat, u.lon) })));
  }
  dispatchUnit(unitId: string, fireId: string): Promise<DispatchResult> {
    const u = this.units.find((x) => x.id === unitId);
    if (!u) return Promise.reject(new Error(`unit ${unitId} 없음`));
    u.status = "enroute";
    u.fire_id = fireId;
    const a = this.alerts.find((x) => x.fire_id === fireId) ?? null;
    if (a && (a.status === "new" || a.status === "ack")) a.status = "dispatched";
    return this.tick({ unit: u, alert: a });
  }
  recallUnit(unitId: string) {
    const u = this.units.find((x) => x.id === unitId);
    if (!u) return Promise.reject(new Error(`unit ${unitId} 없음`));
    u.status = "return";
    delete u.fire_id;
    return this.tick(u);
  }
  /** 진화 완료(목업 mock/agency.js updateFire contained 가지): 추정 소실 면적 · 산정 대기 · 토지 관리 경보 */
  containFire(fireId: string, containedAt: string): Promise<Fire> {
    const f = this.fires.find((x) => x.id === fireId);
    if (!f) return Promise.reject(new Error(`fire ${fireId} 없음`));
    const prev = f.status;
    f.status = "contained";
    if (prev !== "contained") {
      const g = f as Fire & { burned_ha?: number | null; landcover?: unknown; ownership?: unknown; estimated?: boolean; contained_at?: string };
      if (g.burned_ha == null) {
        const ha = Math.round((f.viirs * 0.42 + f.frp_max * 0.03) * 10) / 10;
        g.burned_ha = ha;
        g.landcover = { forest: +(ha * 0.81).toFixed(1), farm: +(ha * 0.11).toFixed(1), grass: +(ha * 0.06).toFixed(1), urban: +(ha * 0.02).toFixed(1) };
        g.ownership = { national: +(ha * 0.18).toFixed(1), public: +(ha * 0.22).toFixed(1), private: +(ha * 0.6).toFixed(1) };
        g.estimated = true;
      }
      g.contained_at = containedAt;
      const id = `A-L${fireId.slice(-5)}`;
      if (!this.alerts.some((a) => a.id === id)) {
        const ha = g.burned_ha ?? 0;
        this.alerts.unshift({
          id,
          fire_id: fireId,
          level: f.level,
          at: containedAt.slice(11, 16),
          title: "진화 완료 · 피해 면적 산정 대기",
          body: `${f.name} 추정 소실 ${ha >= 100 ? Math.round(ha) : ha.toFixed(1)} ha. 필지 확인이 필요합니다.`,
          status: "new",
          targets: ["land"],
        } as Alert);
      }
    }
    return this.tick(f);
  }
  /** 현장 확인 요청(목업 land.js requestCheck): 이 불의 토지 관리 새 경보 → 확인 + 기록 「현장 확인 요청 {n}필지」 */
  requestFieldCheck(fireId: string, parcels: number, at: string): Promise<Alert[]> {
    const hit = this.alerts.filter((a) => a.fire_id === fireId && a.targets.includes("land") && a.status === "new");
    hit.forEach((a) => {
      a.status = "ack";
      (this.notes[a.id] ??= []).push({ at, by: "land", key: "land.log.req_short", params: { n: parcels } });
    });
    return this.tick(hit);
  }
  /** 경보 확인 기록(화면 밖 역할이 남긴 것) — listAlerts 의 ops.log 에 붙는다 */
  private notes: Record<string, { at: string; by: string; key: string; params?: Record<string, string | number> }[]> = {};
  /** 필지 — 목업 pages/land.js 생성기(./land-parcels.ts)가 불마다 결정적으로 만든다 */
  listParcels(fireId: string): Promise<Parcel[]> {
    const f = this.fires.find((x) => x.id === fireId);
    return this.tick(f ? landParcels(f, this.alerts, ledger.regions) : []);
  }
  /** 지휘 통계 — 질의가 있으면 화면 묶음(목업 cmd.js·core.js 생성기, ./cmd-board.ts)을 board 로 싣는다 */
  getCommandStats(q?: CommandQuery): Promise<CommandStats> {
    return this.tick({
      ...(q ? { board: cmdBoard(q, ledger, this.fires, this.units, this.alerts) } : {}),
      fires_live: this.fires.filter((f) => !f.historical && !CLOSED.has(f.status)).length,
      alerts_new: this.alerts.filter((a) => a.status === "new").length,
      units_busy: this.units.filter((u) => u.status === "enroute" || u.status === "onscene").length,
      units_ready: this.units.filter((u) => u.status === "standby").length,
    });
  }
}
