import { api, unwrap } from "./client";

/**
 * 지역 목록 전부(계약 GET /aois — 실서버는 쪽 나눔이라 커서를 끝까지, 최대 20쪽). 캘린더·분석·지역 고르기가 같은 키로 캐시를 나눠 쓰므로
 * 받는 방법도 이 하나로 맞춘다.
 *
 * 숨김(hidden): 실서버는 대륙 「Seven seas (open ocean)」 아래 나라 8개(MDV·MUS·SYC·IOT·ATF·HMD·SGS·SHN)와 그 1급 54개를
 * 기본 목록에서 뺀다(잰 것 2026-11-15 — include_hidden 없이 4,988행, 넣으면 5,051행). 그런데 나라 칩 색인(public/geo/countries.json)은
 * 이 나라들을 고를 수 있게 내놓고, 각 행은 has_data=true 로 캘린더 값이 있다. 그래서 include_hidden=true 로 받고
 * 「숨김」은 대륙 행에만 남긴다(나라·1급은 다른 나라와 똑같이 목록·검색·행에 나온다).
 */
export async function listAllAois<T extends { level: string; hidden?: boolean }>(signal?: AbortSignal, extra?: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = (await api
      .GET("/aois", { params: { query: { limit: 1000, include_hidden: true, ...extra, ...(cursor ? { cursor } : {}) } as never }, signal })
      .then(unwrap)) as unknown as { aois: T[]; next_cursor?: string | null };
    out.push(...r.aois);
    if (!r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return out.map((a) => (a.hidden && a.level !== "continent" ? { ...a, hidden: false } : a));
}
