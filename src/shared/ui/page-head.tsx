import type { ReactNode } from "react";

/**
 * 화면 머리 — 화면 이름 h1 + 도구 자리. 제목 옆 메타 부제(범위·버전 문구)는 그리지 않는다.
 * 개수 띠(EM.ui.counts)는 화면 담당이 채운다.
 */
export function PageHead({ title, tools }: { title: string; tools?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 gutter-x pt-4 pb-3" data-slot="page-head">
      <h1 className="text-page font-strong">{title}</h1>
      {tools ? <div className="ml-auto flex items-center gap-2">{tools}</div> : null}
    </header>
  );
}
