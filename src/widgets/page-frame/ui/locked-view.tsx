"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useSession } from "@/entities/session";
import { LoginDialog } from "@/features/auth-login";
import { DEFAULT_PAGE, ROLE_IDS, pageHref, type Locale, type PageId, type RoleId } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { Button, Icon, buttonVariants } from "@/shared/ui";

/**
 * 잠긴 화면 — 목업 renderLocked 그대로:
 * - 역할 전용 화면: 「{page} 화면은 {roles} 역할 전용」 + [{첫 역할}로 로그인]
 * - 역할 전부에 열린 화면(상황판, 결정 F12): 「{page} 화면은 예시 로그인 뒤에 열림」 + [역할 골라 로그인] — 로그인하면 그 화면으로 돌아온다
 * - 둘 다 옆에 돌아갈 곳 하나: 로그인했으면 [상황판], 아니면 [캘린더](첫 화면)
 * 표시일 뿐이다(정적 HTML 에는 데이터가 없고, 실제 경계는 백엔드).
 */
export function LockedView({ page, roles }: { page: PageId; roles: readonly RoleId[] }) {
  const t = useT();
  const locale = useLocale() as Locale;
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const first = roles[0] as RoleId;
  const need = roles.map((r) => t(`shell.role.${r}.label`)).join(" · ");
  const anyRole = ROLE_IDS.every((r) => roles.includes(r));
  const back: { id: PageId; icon: "grid" | "calendar" } = session?.role ? { id: "home", icon: "grid" } : { id: DEFAULT_PAGE, icon: "calendar" };
  return (
    <div className="grid min-h-full place-items-center px-4 py-12" data-slot="locked">
      <div className="flex max-w-[440px] flex-col items-center gap-4 text-center">
        <div className="grid size-[52px] place-items-center rounded-full bg-s3 text-t2 [&_svg]:size-6">
          <Icon name="lock" />
        </div>
        <h2 className="text-page">
          {anyRole ? t("shell.locked.title_any", { page: t(`shell.page.${page}`) }) : t("shell.locked.title", { page: t(`shell.page.${page}`), roles: need })}
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          <Button kind="primary" data-login="" onClick={() => setOpen(true)}>
            <Icon name="login" />
            {anyRole ? t("shell.locked.login_any") : t("shell.locked.login", { role: t(`shell.role.${first}.label`) })}
          </Button>
          {back.id !== page ? (
            <Link href={pageHref(locale, back.id)} className={buttonVariants()} data-back={back.id}>
              <Icon name={back.icon} />
              {t(`shell.nav.${back.id}.label`)}
            </Link>
          ) : null}
        </div>
      </div>
      <LoginDialog open={open} onOpenChange={setOpen} preset={anyRole ? undefined : first} then={page} />
    </div>
  );
}
