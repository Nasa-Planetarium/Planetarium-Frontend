"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { inbox, type Alert, type Fire } from "@/shared/agency";
import { ROLE_DEF, pageHref, type Locale, type RoleId } from "@/shared/config";
import { useT, useTl } from "@/shared/i18n";
import { toast } from "@/shared/ui/toast";
import { alertTitle, toastKind } from "../model/alert-text";

/**
 * 새 경보 토스트 — 목업 core.js bus "alert:new" 듣기 그대로.
 * 내 역할 대상: 단계 색 토스트 9초 · 제목 굵게 · 「{시각} {불}」 · [열기] → 읽음 + 역할 첫 화면(?alert=) 초점.
 * 긴급대응 대상(내 역할 아님): 7초 · 「{불}, 경보·출동 수신함에 전달됨」.
 * 홈이 지도 알림 띠로 직접 보일 때(inbox.setQuiet) 셸 토스트는 끈다.
 */
export function AlertToaster({ role }: { role: RoleId | null }) {
  const t = useT();
  const tl = useTl();
  const router = useRouter();
  const locale = useLocale() as Locale;
  const qc = useQueryClient();
  const ref = useRef({ t, tl, router, locale, role, qc });
  useLayoutEffect(() => {
    ref.current = { t, tl, router, locale, role, qc };
  });

  useEffect(
    () =>
      inbox.onNew((a: Alert) => {
        const { t, tl, router, locale, role, qc } = ref.current;
        const kind = toastKind(a, role, inbox.get().quiet);
        if (!kind) return;
        const fires = qc.getQueryData<Fire[]>(["agency", "fires"]) ?? [];
        const f = fires.find((x) => x.id === a.fire_id);
        const fname = f ? tl("fire", f.id, "name", f.name) : "";
        const title = <b>{alertTitle(t, a)}</b>;
        if (kind === "mine" && role) {
          toast({
            level: a.level,
            text: title,
            sub: `${a.at} ${fname}`.trim(),
            ms: 9000,
            action: {
              label: t("shell.act.open"),
              onClick: () => {
                inbox.markRead(role, a.id);
                router.push(pageHref(locale, ROLE_DEF[role].home, `alert=${encodeURIComponent(a.id)}`));
              },
            },
          });
        } else {
          toast({ level: a.level, text: title, sub: (fname ? `${fname}, ` : "") + t("shell.bell.forwarded"), ms: 7000 });
        }
      }),
    [],
  );
  return null;
}
