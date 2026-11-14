"use client";

import { useQuery } from "@tanstack/react-query";
import { Popover as P } from "radix-ui";
import { useAgency, type Alert } from "@/shared/agency";
import type { RoleId } from "@/shared/config";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Icon, iconButtonClass } from "@/shared/ui";

const LEVEL_INK = { 1: "text-alert-1", 2: "text-alert-2", 3: "text-alert-3", 4: "text-alert-4" } as const;

/**
 * 알림 종 + 서랍 — 목업 renderTop 의 #bell · toggleDrawer.
 * 경보는 기관 연동 포트에서 받는다(지금은 목 원장). 미확인 수는 목업처럼 처음 0 — 시나리오가 경보를 올릴 때 늘어난다(ops 화면 몫).
 * 서랍 행을 누르면 그 역할 첫 화면으로 가서 경보에 초점(ops 화면 담당이 onOpenAlert 를 채운다).
 */
export function AlertBell({ role, unread, onOpenAlert }: { role: RoleId; unread: ReadonlySet<string>; onOpenAlert?: (a: Alert) => void }) {
  const t = useT();
  const agency = useAgency();
  const { data: alerts = [] } = useQuery({ queryKey: ["agency", "alerts"], queryFn: () => agency.listAlerts() });
  const mine = alerts.filter((a) => a.targets.includes(role));
  const n = mine.filter((a) => unread.has(a.id)).length;
  const sev = mine.some((a) => a.level === 4 && unread.has(a.id));

  return (
    <P.Root>
      <P.Trigger className={iconButtonClass} aria-label={t(sev ? "shell.bell.aria_sev" : "shell.bell.aria", { n })}>
        <Icon name="bell" size="nav" />
        {n > 0 ? (
          <span className="absolute top-0 right-0 inline-flex h-(--sp-5) min-w-(--sp-5) translate-x-[calc(50%-var(--sp-2))] -translate-y-[calc(50%-var(--sp-2))] items-center gap-1 rounded-xs bg-s3 px-1 mono text-fs2 font-strong text-t1">
            {sev ? <i aria-hidden="true" className="size-1.5 flex-none rounded-full bg-alert-4" /> : null}
            {n}
          </span>
        ) : null}
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="end"
          sideOffset={8}
          className="z-70 max-h-[calc(100vh-var(--top)-24px)] w-[min(380px,calc(100vw-24px))] overflow-auto rounded-md border border-line-strong bg-s2 shadow-elev-3"
        >
          <div className="flex min-w-0 items-center justify-between gap-2 px-4 pt-3 pb-2">
            <h3 className="flex items-baseline gap-2 text-fs4 font-strong">
              {t("shell.bell.title")} <small className="text-fs2 font-regular text-t2">{t(`shell.role.${role}.label`)}</small>
            </h3>
          </div>
          {mine.length === 0 ? <p className="p-4 text-t2">{t("shell.bell.none")}</p> : null}
          {mine.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpenAlert?.(a)}
              className={cn(
                "flex w-full gap-3 border-t border-line-soft px-4 py-3 text-left transition-[background-color] duration-(--dur-fast) ease-em hover:bg-s2 focus-visible:-outline-offset-2",
                unread.has(a.id) && "bg-s3",
              )}
            >
              <span className={cn("flex-none text-fs2 font-strong", LEVEL_INK[a.level])}>
                {t(`shell.level.${a.level}`)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t(`data.alert.${a.id}.title`) === `data.alert.${a.id}.title` ? a.title : t(`data.alert.${a.id}.title`)}</span>
                <span className="block text-fs2 text-t2">{a.at}</span>
              </span>
              <span className="text-fs2 text-t2">{t(`shell.status.${a.status}`)}</span>
            </button>
          ))}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
