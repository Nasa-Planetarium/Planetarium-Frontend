"use client";

import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Icon } from "./icon";
import { iconButtonClass } from "./button";

/**
 * 대화상자 — 동작·접근성은 Radix Dialog(shadcn 과 같은 원소), 모양은 목업 .scrim/.modal 그대로.
 * 폭 --modal-w(480) · 넓은 판 --modal-w-wide(760) · 면 surface-2 · 1px line-strong · 반경 --r-m · 그림자 --elev-3.
 * 목업 EM.ui.modal({ title, body, actions }) 와 같은 칸: 제목 줄(닫기) · 본문 · 단추 줄.
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 닫기 단추 접근 이름(사전 shell.act.close) */
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** 화면 읽기 프로그램용 한 줄 설명(없으면 생략) */
  description?: string;
}

export function Dialog({ open, onOpenChange, title, closeLabel, children, footer, wide, description }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-90 grid place-items-center bg-(--scrim) p-4">
          <D.Content
            className={cn(
              "max-h-[calc(100%-32px)] overflow-auto rounded-md border border-line-strong bg-s2 shadow-elev-3 focus-visible:outline-none",
              wide ? "w-[min(var(--modal-w-wide),100%)]" : "w-[min(var(--modal-w),100%)]",
            )}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <D.Title className="text-fs4 font-strong">{title}</D.Title>
              <D.Close className={iconButtonClass} aria-label={closeLabel}>
                <Icon name="x" size="nav" />
              </D.Close>
            </div>
            <D.Description className="sr-only">{description ?? ""}</D.Description>
            <div className="flex flex-col gap-3 px-5 pt-2 pb-4">{children}</div>
            {footer ? <div className="flex justify-end gap-2 border-t border-line-soft px-5 pt-3 pb-4">{footer}</div> : null}
          </D.Content>
        </D.Overlay>
      </D.Portal>
    </D.Root>
  );
}

export const DialogClose = D.Close;
