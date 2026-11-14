"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { RoleCard, RoleGrid, useLogin } from "@/entities/session";
import { useAuth } from "@/shared/auth";
import { ROLE_DEF, ROLE_IDS, pageHref, type Locale, type PageId, type RoleId } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { Button, Icon } from "@/shared/ui";
import { Dialog } from "@/shared/ui/dialog";
import { toast } from "@/shared/ui/toast";

/**
 * 예시 로그인(결정 F6) — 목업 EM.openLogin 그대로: 역할 카드 5개 + 읽기 전용 아이디 + [취소][로그인].
 * 로그인하면 토스트 「{역할} 역할로 로그인했습니다」 후 그 역할 첫 화면(또는 then)으로 간다.
 * 실제 인증이 오면 AuthPort http 어댑터로 바뀌고, 이 창은 아이디·비밀번호 폼으로 바뀐다(설계 §2.3).
 */
type LoginDialogProps = { open: boolean; onOpenChange: (v: boolean) => void; preset?: RoleId; then?: PageId };

/** 열릴 때마다 새로 그린다(고른 역할 = preset 으로 초기화) */
export function LoginDialog(props: LoginDialogProps) {
  return props.open ? <LoginOpen {...props} /> : null;
}

function LoginOpen({ open, onOpenChange, preset, then }: LoginDialogProps) {
  const t = useT();
  const auth = useAuth();
  const login = useLogin();
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [pick, setPick] = useState<RoleId>(preset ?? "responder");

  const submit = async () => {
    await login.mutateAsync(pick);
    onOpenChange(false);
    toast({ text: t("shell.login.done", { role: t(`shell.role.${pick}.label`) }), kind: "ok", ms: 4500 });
    router.push(pageHref(locale, then ?? ROLE_DEF[pick].home));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("shell.login")}
      closeLabel={t("shell.act.close")}
      footer={
        <>
          <Button raised onClick={() => onOpenChange(false)}>
            {t("shell.act.cancel")}
          </Button>
          <Button kind="primary" onClick={submit} disabled={login.isPending}>
            <Icon name="login" />
            {t("shell.login")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RoleGrid>
          {ROLE_IDS.map((r) => (
            <RoleCard
              key={r}
              icon={ROLE_DEF[r].icon}
              label={t(`shell.role.${r}.label`)}
              desc={t(`shell.role.${r}.desc`)}
              pressed={r === pick}
              onClick={() => setPick(r)}
            />
          ))}
        </RoleGrid>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="loginId" className="text-fs2 text-t2">
            {t("shell.login.id")}
          </label>
          <input
            id="loginId"
            readOnly
            value={auth.previewId(pick)}
            className="ctl w-full min-w-0 rounded-sm border border-line-strong bg-s0 px-3 text-fs3 text-t1"
          />
        </div>
      </div>
    </Dialog>
  );
}
