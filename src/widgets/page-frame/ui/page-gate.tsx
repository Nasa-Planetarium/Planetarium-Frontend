"use client";

import type { ReactNode } from "react";
import { useSession } from "@/entities/session";
import { canOpen, type PageId } from "@/shared/config";
import { PageFrame } from "./page-frame";

/**
 * 화면 문지기 — 경로 파일이 화면을 이것으로 감싸면, 지금 세션으로 열 수 없는 화면은 그리지 않고 잠긴 화면(PageFrame)을 보인다.
 * 상황판(home)처럼 화면 슬라이스가 스스로 잠그지 않는 로그인 뒤 화면에 쓴다(결정 F12). 규칙은 canOpen 하나(탭과 같음).
 * 세션을 아직 모르면(불러오는 중·정적 HTML) 골격만 — 화면 데이터 요청도 잠김 깜박임도 없다.
 */
export function PageGate({ page, children }: { page: PageId; children: ReactNode }) {
  const { data: session, isPending } = useSession();
  if (isPending) return <div className="min-h-full" data-slot="page-pending" />;
  if (!canOpen(page, session?.role ?? null)) return <PageFrame page={page} />;
  return <>{children}</>;
}
