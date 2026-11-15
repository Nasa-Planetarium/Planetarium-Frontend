/**
 * 자료 케이스 레지스트리(결정 E4 「케이스 다르게, 케이스문은 쓰면 안 된다」).
 *
 * 고르기 = 판정 순서 배열 ORDER 를 앞에서부터 test 하는 것 하나뿐. if/else 사슬·switch 를 쓰지 않는다
 * (switch 는 eslint no-restricted-syntax 가 막는다).
 * 결과: { id, st, flags, value, lo, hi, wordKey } — st 는 칸 표지 하나(우선순위 = ORDER), flags 는 title·상세용.
 * lo·hi 는 화면 구간(F16, shared/lib/interval displayInterval) — 원값이 아니다(CSV 는 행의 value_lo·value_hi 를 쓴다).
 * 사전: 표지 낱말 shell.st.<st> · 예외 카드 shell.case.<id>.{why,what,how,opinion} (목업 사전 그대로).
 */
import {
  BeforeSensorCase,
  IntervalOutCase,
  LowSampleCase,
  MissingCase,
  NrtCase,
  OkCase,
  OutOfRangeCase,
  PartialCase,
} from "./cases/handlers";
import { displayInterval } from "@/shared/lib/interval";
import { hiOf, loOf, valOf, viewOf } from "./rows";
import type { CaseContext, CaseHandler, CaseId, CaseResult, CaseRow, CaseState } from "./types";

const HANDLERS: CaseHandler[] = [
  new OutOfRangeCase(),
  new BeforeSensorCase(),
  new MissingCase(),
  new IntervalOutCase(),
  new PartialCase(),
  new NrtCase(),
  new LowSampleCase(),
  new OkCase(),
];

export const REGISTRY: ReadonlyMap<CaseId, CaseHandler> = new Map(HANDLERS.map((h) => [h.id, h]));
/** 판정 순서(앞이 우선). 새 경우를 넣을 때 여기 한 자리 */
export const ORDER: readonly CaseId[] = HANDLERS.map((h) => h.id);

/** 경우 → 에러 코드(방법 화면 「자료 상태」 카드) */
export const CASE_CODE: Readonly<Record<CaseId, string>> = Object.fromEntries(HANDLERS.map((h) => [h.id, h.code])) as Record<CaseId, string>;

const get = (id: CaseId) => REGISTRY.get(id) as CaseHandler;

export function judge(row: CaseRow | null | undefined, ctx: CaseContext = {}): CaseResult {
  const r: CaseRow = row ?? { status: "out_of_range" };
  const hits = ORDER.filter((id) => get(id).test(r, ctx));
  const first = hits[0] ?? "ok";
  const used = get(first).stop ? [first] : hits;
  const isRaw = viewOf(ctx) !== "value";
  const value = valOf(r, ctx);
  // F16: 화면 구간은 min/max(value_lo, value_hi, value) — 값을 자르지 않고 구간을 넓힌다(구간 열이 null 이면 값만)
  const iv = isRaw ? null : displayInterval(value, loOf(r), hiOf(r));
  const base = { value, lo: iv?.lo ?? null, hi: iv?.hi ?? null };
  const patched = used.reduce((o, id) => ({ ...o, ...get(id).apply(r, ctx) }), base);
  const st = (used.map((id) => get(id).st).find((s): s is CaseState => s != null) ?? "ok") as CaseState;
  return {
    id: first,
    st,
    flags: used.filter((id) => get(id).flag),
    value: patched.value ?? null,
    lo: patched.lo ?? null,
    hi: patched.hi ?? null,
    wordKey: `shell.st.${st}`,
  };
}

/** /calendar months[] 한 행(또는 comparison 행) */
export const judgeMonth = judge;
/** /cells 칸 속성 하나 */
export const judgeCell = judge;
/** 예외 카드 사전 키(why·what·how·opinion) */
export const caseCardKeys = (id: CaseId) => ({
  why: `shell.case.${id}.why`,
  what: `shell.case.${id}.what`,
  how: `shell.case.${id}.how`,
  opinion: `shell.case.${id}.opinion`,
});
