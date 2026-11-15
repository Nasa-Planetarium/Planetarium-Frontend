"use client";

import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { useT } from "@/shared/i18n";
import type { CsvMeta } from "@/shared/lib/export";
import { downloadCsv } from "./download";
import { toast } from "./toast";
import s from "./csv-button.module.css";

export interface CsvFile {
  name: string;
  text: string;
  meta: CsvMeta;
}

/**
 * 층(화재 사건 · FWI · 불 유형 · FRP · 위성 상태 · 칸) CSV 단추 하나.
 * 누르면 make() 가 실제 API 응답을 받아 CSV 글을 만든다 → BOM + 메타 첫 줄로 저장 + 토스트(n행).
 * 받지 못하면 토스트 「내려받지 못함」(화면은 그대로). 시험·점검은 data-lcsv=<층> 으로 찾는다.
 */
export function CsvButton({ kind, aria, make, disabled, label }: { kind: string; aria: string; make: () => Promise<CsvFile | null>; disabled?: boolean; label?: ReactNode }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const f = await make();
      if (f) downloadCsv(f.name, f.text, f.meta);
    } catch {
      toast({ text: t("csv.err"), icon: "alert" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={s.b} data-lcsv={kind} aria-label={aria} title={aria} disabled={disabled || busy} aria-busy={busy || undefined} onClick={() => void go()}>
      <Download aria-hidden="true" strokeWidth={1.9} />
      {label ?? "CSV"}
    </button>
  );
}
