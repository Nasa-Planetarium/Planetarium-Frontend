/** 파일 내려받기 — 셸 공용(저장 토스트 「n행」 + 복사) */
export { downloadText } from "@/shared/ui/download";
export function toCSV<T>(rows: T[], cols: { label: string; get: (r: T) => string | number | null | undefined }[]) {
  const q = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(","))].join("\n");
}
