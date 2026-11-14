"use client";

import { Toaster as Sonner, toast as sonner } from "sonner";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { useDevice } from "@/shared/lib/use-device";
import { Icon, type IconName } from "./icon";

/**
 * 토스트 — 큐·타이머·접근성은 sonner(shadcn 권장), 모양은 목업 .toast 그대로(unstyled + 토큰 유틸).
 * 위치: 폰 = 머리줄 바로 아래 가운데(바닥은 행동 단추 자리), 그 밖 = 오른쪽 아래(목업 EM.ui.toast screen:true).
 * 색 왼쪽 테두리는 경보 단계(l1–l4) 토스트만.
 */
export interface ToastInput {
  text: ReactNode;
  sub?: ReactNode;
  kind?: "ok" | "info";
  level?: 1 | 2 | 3 | 4;
  icon?: IconName;
  ms?: number;
  action?: { label: ReactNode; onClick: () => void };
}

const LEVEL_BORDER = {
  1: "border-l-3 border-l-alert-1 [&>svg]:text-alert-1",
  2: "border-l-3 border-l-alert-2 [&>svg]:text-alert-2",
  3: "border-l-3 border-l-alert-3 [&>svg]:text-alert-3",
  4: "border-l-3 border-l-alert-4 [&>svg]:text-alert-4",
} as const;

export function toast(o: ToastInput) {
  const icon: IconName = o.icon ?? ((o.level ?? 0) >= 3 ? "alert" : o.kind === "ok" ? "check" : "info");
  return sonner.custom(
    (id) => (
      <div
        className={cn(
          "flex w-[min(380px,calc(100vw-32px))] animate-tin items-start gap-3 rounded-sm border border-line-strong bg-s3 px-4 py-3 text-fs3 shadow-elev-3",
          "[&>svg]:ic-inline [&>svg]:mt-(--sp-half) [&>svg]:text-t2",
          o.kind === "ok" && "[&>svg]:text-ok",
          o.level ? LEVEL_BORDER[o.level] : null,
        )}
      >
        <Icon name={icon} size="inline" />
        <div className="min-w-0 flex-1">
          <div>{o.text}</div>
          {o.sub ? <div className="mt-0.5 text-fs2 text-t2">{o.sub}</div> : null}
        </div>
        {o.action ? (
          <button
            type="button"
            className="relative ml-2 inline-flex ctl-sm items-center rounded-sm bg-s2 px-2 text-fs2 font-medium hover:bg-line-soft"
            onClick={() => {
              o.action?.onClick();
              sonner.dismiss(id);
            }}
          >
            {o.action.label}
          </button>
        ) : null}
      </div>
    ),
    { duration: o.ms ?? 6500, unstyled: true },
  );
}

export function Toaster() {
  const device = useDevice();
  const phone = device === "phone";
  return (
    <Sonner
      position={phone ? "top-center" : "bottom-right"}
      offset={phone ? { top: "calc(var(--bar-h) + var(--sp-2))" } : { right: 16, bottom: 16 }}
      gap={8}
      visibleToasts={4}
      toastOptions={{ unstyled: true }}
    />
  );
}
