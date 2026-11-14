/**
 * TanStack Query 키 규칙(설계 §5.3): [경로 이름, 정규화한 파라미터, method_version]
 * - 정규화: 키 이름 정렬 · undefined/null/빈 문자열 제거 · 숫자는 그대로 · bbox 등 소수는 4자리.
 * - method_version 이 바뀌면(새 release) 키가 바뀌어 옛 캐시를 쓰지 않는다(지우지 않고 키를 바꾼다).
 * 슬라이스는 이 함수로만 키를 만든다: entities/<x>/api/queries.ts
 */
export type QueryParams = Record<string, string | number | boolean | null | undefined | readonly number[]>;

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function normalizeParams(p: QueryParams = {}): Record<string, string | number | boolean | number[]> {
  const out: Record<string, string | number | boolean | number[]> = {};
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) out[k] = (v as readonly number[]).map(r4);
    else out[k] = v as string | number | boolean;
  }
  return out;
}

export const qk = (route: string, params: QueryParams | undefined, methodVersion: string | null) =>
  [route, normalizeParams(params), methodVersion ?? "mv?"] as const;
