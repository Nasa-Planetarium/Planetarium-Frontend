"use client";

import { Suspense, type ReactNode } from "react";
import { TopBar } from "@/widgets/top-bar";
import { Toaster } from "@/shared/ui/toast";

/**
 * 셸 배치 — 목업 .app: 머리줄 하나 + 본문(#view). 왼쪽 레일 없음.
 * 머리줄은 주소 쿼리(?c=)를 읽으므로 Suspense 안(정적 내보내기 규칙). 기다리는 동안 같은 높이의 빈 띠.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]" id="app">
        <Suspense fallback={<div className="h-(--bar-h) border-b border-line-soft bg-s2" aria-hidden="true" />}>
          <TopBar />
        </Suspense>
        <main id="view" tabIndex={-1} className="relative min-h-0 min-w-0 overflow-auto">
          {children}
        </main>
      </div>
      <Toaster />
    </>
  );
}
