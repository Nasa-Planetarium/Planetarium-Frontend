"use client";

import { getLastDataVersion } from "@/shared/api";
import { useT } from "@/shared/i18n";
import { BOM, csvFileText, csvRowCount, zipBytes, type CsvMeta, type ZipEntry } from "@/shared/lib/export";
import { toast } from "./toast";

/**
 * 내려받기 — 목업 EM.ui.downloadText · downloadImage · trySave 그대로:
 * 누르면 바로 저장하고, 오른쪽 아래 토스트로 「{파일} 저장」 + 부가 줄(CSV = 「n행」 · 이미지 = 「W × H PNG」)을 알린다.
 * CSV 토스트에는 [복사] — 누르면 내용을 클립보드에 넣고 「클립보드에 복사했습니다」(2.5초). 클립보드가 막히면 조용히 둔다(저장은 이미 했다).
 * 행 수 = 데이터 줄 수(BOM · 메타 주석 `#` · 머리줄 · 끝 빈 줄 제외 — shared/lib/csv csvRowCount).
 * CSV 는 모두 BOM + 첫 줄 메타 주석(data_version · 지역 · 기간)으로 저장한다(downloadCsv · shared/lib/csv 규칙).
 */

function Tr({ k, p }: { k: string; p?: Record<string, string | number> }) {
  const t = useT();
  return <>{t(k, p)}</>;
}

/** 파일 저장만(목업 trySave) */
export function saveFile(name: string, blob: Blob) {
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  } catch {
    /* 저장 막힘(사파리 사생활 창 등) — 화면은 그대로 */
  }
}

/** 저장 토스트: 글(CSV) — n행 + 복사 */
export function notifyTextSaved(name: string, text: string) {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  const rows = csvRowCount(body);
  toast({
    kind: "ok",
    icon: "download",
    text: <Tr k="shell.dl.saved" p={{ name }} />,
    sub: <Tr k="shell.dl.rows" p={{ n: rows }} />,
    action: {
      label: <Tr k="shell.act.copy" />,
      onClick: () => {
        try {
          void navigator.clipboard.writeText(body).then(
            () => toast({ kind: "ok", text: <Tr k="shell.dl.copied" />, ms: 2500 }),
            () => undefined,
          );
        } catch {
          /* 클립보드 막힘: 저장은 이미 했다 */
        }
      },
    },
  });
}

/** 저장 토스트: 이미지 — 「W × H PNG」 */
export function notifyImageSaved(name: string, w: number, h: number) {
  toast({ kind: "ok", icon: "download", text: <Tr k="shell.dl.saved" p={{ name }} />, sub: `${w} × ${h} PNG` });
}

/** 메타의 data_version 이 비면 마지막 응답 헤더 X-Data-Version 으로 채운다 */
export function withDataVersion(meta?: CsvMeta | null): CsvMeta {
  return { ...(meta ?? {}), data_version: meta?.data_version || getLastDataVersion() || "" };
}

/** CSV 파일 글(BOM + 메타 첫 줄 + 본문) — 묶음(zip)에 넣을 때도 이것 */
export function csvFile(text: string, meta?: CsvMeta | null): string {
  return csvFileText(text, withDataVersion(meta));
}

/** CSV 내려받기: BOM + 메타 첫 줄(data_version · 지역 · 기간) + 본문 저장 + 토스트(n행 · 복사) */
export function downloadCsv(name: string, text: string, meta?: CsvMeta | null) {
  const file = csvFile(text, meta);
  saveFile(name, new Blob([file], { type: "text/csv;charset=utf-8" }));
  notifyTextSaved(name, file);
}

/** 글 내려받기(목업 EM.ui.downloadText): CSV 면 downloadCsv 와 같다(BOM · 메타 첫 줄) */
export function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8", meta?: CsvMeta | null) {
  if (mime.startsWith("text/csv")) return downloadCsv(name, text, meta);
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  saveFile(name, new Blob([BOM + body], { type: mime }));
  notifyTextSaved(name, body);
}

/** 여러 파일을 zip 하나로(브라우저에서 만듦 · 압축 없음) 저장 + 토스트(「n개 파일」) */
export function downloadZip(name: string, entries: readonly ZipEntry[]) {
  const bytes = zipBytes(entries);
  saveFile(name, new Blob([bytes as BlobPart], { type: "application/zip" }));
  toast({ kind: "ok", icon: "download", text: <Tr k="shell.dl.saved" p={{ name }} />, sub: <Tr k="csv.files" p={{ n: entries.length }} /> });
}

/** 캔버스 내려받기(목업 EM.ui.downloadImage) */
export function downloadCanvas(name: string, canvas: HTMLCanvasElement) {
  canvas.toBlob((b) => {
    if (b) saveFile(name, b);
  }, "image/png");
  notifyImageSaved(name, canvas.width, canvas.height);
}

/**
 * 이미 만든 파일 덩어리 저장 + 알맞은 토스트 — 글(csv·json·txt)이면 n행 + 복사, 이미지면 크기를 읽어 「W × H PNG」.
 * 화면별 내려받기 도우미가 이 하나로 모인다.
 */
export function downloadBlob(name: string, blob: Blob) {
  saveFile(name, blob);
  const type = blob.type || "";
  if (type.startsWith("image/")) {
    if (typeof createImageBitmap === "function")
      void createImageBitmap(blob).then(
        (bm) => {
          notifyImageSaved(name, bm.width, bm.height);
          bm.close();
        },
        () => toast({ kind: "ok", icon: "download", text: <Tr k="shell.dl.saved" p={{ name }} /> }),
      );
    else toast({ kind: "ok", icon: "download", text: <Tr k="shell.dl.saved" p={{ name }} /> });
    return;
  }
  void blob.text().then(
    (txt) => notifyTextSaved(name, txt),
    () => toast({ kind: "ok", icon: "download", text: <Tr k="shell.dl.saved" p={{ name }} /> }),
  );
}
