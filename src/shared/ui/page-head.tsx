import type { ReactNode } from "react";

/**
 * 화면 머리 — 목업 EM.ui.pageHead 의 줄 1(화면 이름 h1 + 범위 + 도구) 자리.
 * 골격 단계에서는 제목만 그린다. 범위·도구·개수 띠(EM.ui.counts)는 화면 담당이 채운다.
 */
export function PageHead({ title, scope, tools }: { title: string; scope?: ReactNode; tools?: ReactNode }) {
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 gutter-x pt-4 pb-3" data-slot="page-head">
      <h1 className="text-page font-strong">{title}</h1>
      {scope ? <span className="text-fs3 text-t2">{scope}</span> : null}
      {tools ? <div className="ml-auto flex items-center gap-2">{tools}</div> : null}
    </header>
  );
}
