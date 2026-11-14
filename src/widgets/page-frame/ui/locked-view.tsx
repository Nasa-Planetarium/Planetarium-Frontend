"use client";

import { useState } from "react";
import { LoginDialog } from "@/features/auth-login";
import type { PageId, RoleId } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { Button, Icon } from "@/shared/ui";

/**
 * 잠긴 화면 — 목업 renderLocked: 「{page} 화면은 {roles} 역할 전용」 + [{첫 역할}로 로그인].
 * 표시일 뿐이다(정적 HTML 에는 데이터가 없고, 실제 경계는 백엔드).
 */
export function LockedView({ page, roles }: { page: PageId; roles: readonly RoleId[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const first = roles[0] as RoleId;
  const need = roles.map((r) => t(`shell.role.${r}.label`)).join(" · ");
  return (
    <div className="grid min-h-full place-items-center px-4 py-12" data-slot="locked">
      <div className="flex max-w-[440px] flex-col items-center gap-4 text-center">
        <div className="grid size-[52px] place-items-center rounded-full bg-s3 text-t2 [&_svg]:size-6">
          <Icon name="lock" />
        </div>
        <h2 className="text-page">{t("shell.locked.title", { page: t(`shell.page.${page}`), roles: need })}</h2>
        <div className="flex flex-wrap justify-center gap-2">
          <Button kind="primary" onClick={() => setOpen(true)}>
            <Icon name="login" />
            {t("shell.locked.login", { role: t(`shell.role.${first}.label`) })}
          </Button>
        </div>
      </div>
      <LoginDialog open={open} onOpenChange={setOpen} preset={first} then={page} />
    </div>
  );
}
