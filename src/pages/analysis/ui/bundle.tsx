"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useCoarseCells } from "@/entities/world-grid";
import { ApiError, cellsTooMany } from "@/shared/api";
import { csvFile, downloadZip, type CsvFile } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { aoisQuery, cellsQuery, summaryQuery, type CellsData } from "../api/queries";
import { safeName, trDefault } from "../model/analysis";
import { ymIso } from "../model/core";
import { cx } from "./cx";
import { cellsFile, trendDayFile, trendMonthFile } from "./s2";
import { calendarFile, resultFile } from "./s3";
import type { Ctx } from "./types";

const isKorAoi = (id: string) => /^(KR|SIDO_|SGG_|group:)/.test(id);

/**
 * 「분석 자료 내려받기」 — 고른 지역·달의 캘린더 · 비교 결과 · 칸 월 값 · 날짜 범위 추이(월별, 한국 지역은 일별도) CSV 를 zip 하나로.
 * zip 은 브라우저에서 만든다(shared/lib/zip, 압축 없음). 파일마다 BOM + 메타 첫 줄. 이름 = emberline_analysis_<지역>_<달>.zip.
 * 칸: /cells(0.1°) — 칸 1만 개를 넘는 지역은 화면과 같은 1° 묶음(world-1deg)으로, 받는 동안 단추는 「묶는 중…」.
 * 하나라도 못 받으면 그 파일만 빼고 묶지 않는다 — 토스트 「내려받지 못함」(반쪽 묶음을 정상처럼 내지 않음).
 */
export function BundleButton({ x }: { x: Ctx }) {
  const qc = useQueryClient();
  const mv = x.M?.method_version ?? null;
  const ym = ymIso(x.y, x.m);
  const aq = useQuery(aoisQuery(mv));
  const [busy, setBusy] = useState(false);
  const [wide, setWide] = useState(false);
  const pending = useRef<CsvFile[] | null>(null);
  const co = useCoarseCells({ aoiId: x.aoi, aois: aq.data, y: x.y, m: x.m, on: busy && wide });

  const finish = (files: CsvFile[]) => {
    downloadZip(
      `emberline_analysis_${safeName(x.aoi)}_${ym}.zip`,
      files.map((f) => ({ name: f.name, data: csvFile(f.text, f.meta) })),
    );
    pending.current = null;
    setBusy(false);
    setWide(false);
  };
  const fail = () => {
    pending.current = null;
    setBusy(false);
    setWide(false);
    toast({ text: x.t("csv.err"), icon: "alert" });
  };

  useEffect(() => {
    if (!busy || !wide || !pending.current) return;
    if (co.data) finish([...pending.current, cellsFile(x, co.data as unknown as CellsData, ym)]);
    else if (co.isError) fail();
    // finish·fail 은 이 렌더의 x 를 쓴다 — 묶음 하나 동안 지역·달이 바뀌지 않는다(단추가 막혀 있음)
  }, [busy, wide, co.data, co.isError]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    if (busy || !mv) return;
    setBusy(true);
    try {
      const files: CsvFile[] = [];
      const cal = calendarFile(x);
      if (cal) files.push(cal);
      const res = resultFile(x);
      if (res) files.push(res);
      const tr = { ...trDefault(x.y, x.m), freq: "month" as const };
      files.push(trendMonthFile(x, tr));
      if (isKorAoi(x.aoi)) {
        const R = await qc.fetchQuery(summaryQuery(x.aoi, tr.start, tr.end, mv, true));
        files.push(trendDayFile(x, { ...tr, freq: "day" }, R));
      }
      const rec = (aq.data ?? []).find((a) => a.aoi_id === x.aoi);
      if (!cellsTooMany(rec)) {
        try {
          const d = await qc.fetchQuery(cellsQuery(x.aoi, ym, mv, true));
          return finish([...files, cellsFile(x, d, ym)]);
        } catch (e) {
          /* 자료 준비 중(503)이면 머리줄만 있는 칸 파일 + 메타 error 로 밝힌다(빈 칸을 0 으로 내지 않음) */
          if (e instanceof ApiError && e.code === "data_not_loaded") {
            const f = cellsFile(x, { features: [] }, ym);
            return finish([...files, { ...f, meta: { ...f.meta, error: "data_not_loaded" } }]);
          }
          /* 넓은 범위(400 range_too_large)만 1° 묶음으로 — 그 밖 오류는 실패 */
          if (!(e instanceof ApiError && e.code === "range_too_large")) throw e;
        }
      }
      pending.current = files;
      setWide(true);
    } catch {
      fail();
    }
  };

  return (
    <button type="button" className={cx("btn sm an-bundle")} data-bundle="" disabled={busy || !x.c} aria-busy={busy || undefined} title={x.t("csv.bundle_d", { a: x.aoiName(x.rec), p: ym })} onClick={() => void go()}>
      <Download aria-hidden="true" />
      {busy ? x.t("csv.bundle_busy") : x.t("csv.bundle")}
    </button>
  );
}
