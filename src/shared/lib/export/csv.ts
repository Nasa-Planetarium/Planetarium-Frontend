/**
 * CSV 내보내기 공통 규칙(모든 화면의 CSV 가 이 하나를 따른다).
 * - 인코딩: UTF-8 + BOM(엑셀이 한글을 깨뜨리지 않게). BOM 은 저장할 때 한 번만 붙인다(이미 있으면 떼고 다시 — 두 겹 금지).
 * - 첫 줄: 메타 주석 `# data_version=…; aoi=…; period=…; …` — 자료 판·지역·기간을 파일만 보고 알 수 있게.
 *   읽을 때는 `#` 로 시작하는 줄을 주석으로(pandas `comment="#"`, R `comment.char="#"`).
 * - 값: 원값 그대로(반올림·화면 구간 다듬기 없음). 결측 = 빈 칸(0 이 아님). 따옴표 규칙 RFC 4180.
 */
export const BOM = "﻿";

export type CsvValue = string | number | boolean | null | undefined;

/** 칸 하나(RFC 4180): 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다. 객체·배열은 JSON 글로 */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 행(객체) 목록 → CSV 글. cols 를 안 주면 모든 행의 키를 처음 나온 순서대로 */
export function rowsToCsv(rows: readonly Record<string, unknown>[], cols?: readonly string[]): string {
  const keys = cols ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [keys.join(","), ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(","))].join("\n");
}

export interface CsvMeta {
  /** 자료 판(응답 X-Data-Version · /methods/current data_version) */
  data_version?: string | null;
  /** 지역 id(이름이 있으면 괄호로) */
  aoi?: string | null;
  aoi_name?: string | null;
  /** 기간(YYYY-MM · YYYY-MM-DD/YYYY-MM-DD 등) */
  period?: string | null;
  /** 그 밖 키=값(예 source=/fire-events · cell_size_deg=1) — 순서대로 붙는다 */
  [k: string]: string | number | boolean | null | undefined;
}

/** 메타 → 주석 한 줄(쉼표·줄바꿈·세미콜론은 공백으로 — 엑셀이 첫 칸 하나로 읽게) */
export function metaLine(meta: CsvMeta): string {
  const clean = (v: unknown) => String(v).replace(/[,;\r\n]+/g, " ").trim();
  const parts: string[] = [];
  const { data_version, aoi, aoi_name, period, ...rest } = meta;
  parts.push(`data_version=${clean(data_version ?? "")}`);
  if (aoi != null) parts.push(`aoi=${clean(aoi)}${aoi_name ? ` (${clean(aoi_name)})` : ""}`);
  if (period != null) parts.push(`period=${clean(period)}`);
  for (const [k, v] of Object.entries(rest)) if (v != null && v !== "") parts.push(`${k}=${clean(v)}`);
  return `# ${parts.join("; ")}`;
}

/** 저장할 파일 글: BOM + 메타 줄 + 본문(본문 앞 BOM·끝 빈 줄은 정리). 메타가 없으면 BOM + 본문 */
export function csvFileText(body: string, meta?: CsvMeta | null): string {
  let b = body.startsWith(BOM) ? body.slice(1) : body;
  b = b.replace(/(\r?\n)+$/, "");
  return BOM + (meta ? `${metaLine(meta)}\n` : "") + b + "\n";
}

/** 데이터 행 수(BOM·메타 주석·머리줄·끝 빈 줄 제외) */
export function csvRowCount(text: string): number {
  const b = text.startsWith(BOM) ? text.slice(1) : text;
  const lines = b.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const data = lines.filter((l) => !l.startsWith("#"));
  return Math.max(0, data.length - 1);
}
