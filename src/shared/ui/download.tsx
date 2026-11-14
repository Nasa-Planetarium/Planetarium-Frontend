"use client";

import { useT } from "@/shared/i18n";
import { toast } from "./toast";

/**
 * 내려받기 — 목업 EM.ui.downloadText · downloadImage · trySave 그대로:
 * 누르면 바로 저장하고, 오른쪽 아래 토스트로 「{파일} 저장」 + 부가 줄(CSV = 「n행」 · 이미지 = 「W × H PNG」)을 알린다.
 * CSV 토스트에는 [복사] — 누르면 내용을 클립보드에 넣고 「클립보드에 복사했습니다」(2.5초). 클립보드가 막히면 조용히 둔다(저장은 이미 했다).
 * 행 수 = 줄 수 − 1(머리줄 제외 — 목업과 같은 셈).
 */
const BOM = "﻿";

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
  const rows = body.split("\n").length - 1;
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

/** 글 내려받기(목업 EM.ui.downloadText): BOM 을 붙여 저장 + 토스트 */
export function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8") {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  saveFile(name, new Blob([BOM + body], { type: mime }));
  notifyTextSaved(name, body);
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
