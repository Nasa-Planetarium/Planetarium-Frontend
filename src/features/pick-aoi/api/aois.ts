import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap } from "@/shared/api";
import type { AoiRec } from "../model/aoi";

/**
 * 지역 목록 전부(계약 GET /aois — 실서버는 쪽 나눔이라 커서를 끝까지, 최대 20쪽).
 * 키는 캘린더·분석 화면의 같은 쿼리와 같다(qk("aois", {all:1}, mv)) → 캐시를 나눠 쓴다.
 * WORLD 가 없으면(MSW 스냅숏) 앞에 하나 붙인다.
 */
export const aoiIndexQuery = (mv: string | null) =>
  queryOptions({
    queryKey: qk("aois", { all: 1 }, mv),
    queryFn: async ({ signal }) => {
      const out: AoiRec[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const r = (await api.GET("/aois", { params: { query: { limit: 1000, ...(cursor ? { cursor } : {}) } }, signal }).then(unwrap)) as unknown as {
          aois: AoiRec[];
          next_cursor?: string | null;
        };
        out.push(...r.aois);
        if (!r.next_cursor) break;
        cursor = r.next_cursor;
      }
      if (!out.some((a) => a.aoi_id === "WORLD")) out.unshift({ aoi_id: "WORLD", level: "world", name_ko: null, name_en: null, parent_id: null, synthetic: true });
      return out;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!mv,
  });
