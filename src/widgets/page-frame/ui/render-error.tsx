"use client";

import { useEffect } from "react";
import { useT } from "@/shared/i18n";

/**
 * 화면 렌더 오류 상자 — 목업 route() 의 try { p.mount } catch: 잠긴 화면과 같은 가운데 상자에
 * 「화면을 그리지 못했습니다」 + 오류 글(작게, 고정폭). 머리줄은 그대로 남아 다른 화면으로 갈 수 있다.
 */
export function RenderError({ error }: { error: Error }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-full place-items-center px-4 py-12" data-slot="render-error" role="alert">
      <div className="flex max-w-[440px] flex-col items-center gap-4 text-center">
        <b>{t("shell.err.render")}</b>
        <p className="mono text-fs2 text-t2">{error.message}</p>
      </div>
    </div>
  );
}
