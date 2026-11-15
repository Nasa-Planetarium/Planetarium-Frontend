import { api } from "./client";
import { ApiError } from "./errors";

/**
 * 계약이 text/csv 를 내는 경로(format=csv)를 글 그대로 받는다 — 서버가 만든 CSV(원값·열 순서)를 손대지 않고 저장하려고.
 * 실패(problem+json)는 미들웨어가 ApiError 로 던진다. 받은 글 앞의 BOM 은 저장할 때 shared/lib/csv 가 한 번만 붙인다.
 */
export async function getCsvText(path: string, query: Record<string, string | number | boolean | undefined>, pathParams?: Record<string, string>): Promise<string> {
  const q = Object.fromEntries(Object.entries({ ...query, format: "csv" }).filter(([, v]) => v !== undefined && v !== ""));
  const r = await api.GET(path as never, { params: { query: q, path: pathParams } as never, parseAs: "text" } as never);
  const { data, response } = r as { data?: unknown; response?: Response };
  /* CSV 가 아닌 몸(목 MSW 의 JSON 등)을 .csv 로 저장하지 않는다 */
  const ct = response?.headers.get("content-type") ?? "";
  if (typeof data !== "string" || !/text\/csv/i.test(ct)) throw new ApiError(406, "not_acceptable", null, "csv expected");
  return data;
}
