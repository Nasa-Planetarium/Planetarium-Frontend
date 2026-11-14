"use client";

import type { ReactNode } from "react";
import { useSession } from "@/entities/session";
import { LockedView } from "./locked-view";
import { PAGES, canOpen, type PageId } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { PageHead } from "@/shared/ui";

/**
 * 화면 틀 — 제목(화면 이름 = 탭 이름과 같은 낱말) + 본문 자리.
 * 역할 화면(ops·land·cmd·lab)은 그 역할로, 상황판(home)은 어느 역할로든 로그인하지 않았으면 잠긴 화면을 보여 준다(결정 F12).
 * 세션을 아직 모르면(불러오는 중) 골격만 — 잠김 깜박임 없음(설계 §3.2).
 * 화면 담당은 children 만 채운다(data-slot="page-body").
 */
export function PageFrame({ page, children }: { page: PageId; children?: ReactNode }) {
  const t = useT();
  const { data: session, isPending } = useSession();
  const roles = PAGES[page].roles;
  const title = t(`shell.page.${page}`);
  if (roles) {
    if (isPending) return <div className="min-h-full" data-slot="page-pending" />;
    if (!canOpen(page, session?.role ?? null)) return <LockedView page={page} roles={roles} />;
  }
  return (
    <div className="flex min-h-full min-w-0 flex-col" data-page={page}>
      <PageHead title={title} />
      <section className="min-h-0 min-w-0 flex-1" data-slot="page-body" aria-label={title}>
        {children}
      </section>
    </div>
  );
}
