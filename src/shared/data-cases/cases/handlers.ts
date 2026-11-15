/**
 * 경우별 처리기 클래스. 새 경우 = 클래스 하나 + registry.ts 의 ORDER 한 자리(기존 처리기는 고치지 않음).
 * 판정(verdict)은 다루지 않는다(release 값을 읽기만, A1).
 */
import { FIRST, LAST, SENSOR_FROM, hasNum, hiOf, loOf, valOf, viewOf, ymOf } from "../rows";
import type { CaseContext, CaseHandler, CaseId, CasePatch, CaseRow, CaseState } from "../types";

abstract class BaseCase implements CaseHandler {
  abstract readonly id: CaseId;
  readonly stop: boolean = false;
  readonly flag: boolean = false;
  readonly st: CaseState | null = null;
  abstract readonly code: string;
  abstract test(row: CaseRow, ctx: CaseContext): boolean;
  apply(): CasePatch {
    return {};
  }
}

const BLANK: CasePatch = { value: null, lo: null, hi: null };

/** release 기간(2000-11 – 2026-11) 밖 또는 status out_of_range → 값 없음 */
export class OutOfRangeCase extends BaseCase {
  readonly id = "out_of_range";
  override readonly stop = true;
  override readonly st = "out_of_range";
  readonly code = "E-RANGE";
  test(r: CaseRow) {
    const ym = ymOf(r);
    return r.status === "out_of_range" || (!!ym && (ym < FIRST || ym > LAST));
  }
  override apply() {
    return BLANK;
  }
}

/** 원자료 보기에서 센서 운용 전(VIIRS 2012-02 전) — 결측이 아니다 */
export class BeforeSensorCase extends BaseCase {
  readonly id = "before_sensor";
  override readonly stop = true;
  override readonly st = "before_sensor";
  readonly code = "E-SENSOR";
  test(r: CaseRow, c: CaseContext) {
    const ym = ymOf(r);
    return viewOf(c) !== "value" && !!ym && ym < SENSOR_FROM[viewOf(c)];
  }
  override apply() {
    return BLANK;
  }
}

/** E2: 결측 — status missing 또는 운용 기간 안의 null. 값 null 「결측」, 0 으로 바꾸지 않는다 */
export class MissingCase extends BaseCase {
  readonly id = "missing";
  override readonly stop = true;
  override readonly st = "missing";
  readonly code = "E2-MISSING";
  test(r: CaseRow, c: CaseContext) {
    return r.status === "missing" || valOf(r, c) == null;
  }
  override apply() {
    return BLANK;
  }
}

/** E3: 값이 [value_lo, value_hi] 밖 → 값은 그대로, 플래그만. 구간은 버리지 않고 값까지 넓힌다(F16 — registry 의 displayInterval) */
export class IntervalOutCase extends BaseCase {
  readonly id = "interval_out";
  override readonly flag = true;
  readonly code = "E3-INTERVAL";
  test(r: CaseRow, c: CaseContext) {
    const lo = loOf(r);
    const hi = hiOf(r);
    return viewOf(c) === "value" && hasNum(r.value) && hasNum(lo) && hasNum(hi) && (r.value < lo || r.value > hi);
  }
}

export class PartialCase extends BaseCase {
  readonly id = "partial";
  override readonly st = "partial";
  readonly code = "S-PARTIAL";
  test(r: CaseRow) {
    return r.status === "partial";
  }
}

export class NrtCase extends BaseCase {
  readonly id = "nrt";
  override readonly st = "nrt";
  readonly code = "S-NRT";
  test(r: CaseRow) {
    return r.status === "nrt";
  }
}

export class LowSampleCase extends BaseCase {
  readonly id = "low_sample";
  override readonly flag = true;
  readonly code = "S-LOWN";
  test(r: CaseRow) {
    return r.low_sample === true || r.cmp?.low_sample === true;
  }
}

export class OkCase extends BaseCase {
  readonly id = "ok";
  override readonly st = "ok";
  readonly code = "S-OK";
  test() {
    return true;
  }
}
