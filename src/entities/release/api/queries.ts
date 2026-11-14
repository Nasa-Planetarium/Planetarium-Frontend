import { queryOptions } from "@tanstack/react-query";
import { api, qk, unwrap } from "@/shared/api";

/**
 * 지금 판(method_version). 모든 실제 데이터 쿼리 키의 셋째 칸이 이 값이다(키 규칙 shared/api/query-keys.ts).
 * 판이 바뀌면 이 쿼리를 무효화 → 모든 키가 새 판으로 바뀐다.
 */
export const methodQuery = () =>
  queryOptions({
    queryKey: qk("methods/current", undefined, "current"),
    queryFn: ({ signal }) => api.GET("/methods/current", { signal }).then(unwrap),
    staleTime: 5 * 60 * 1000,
  });
