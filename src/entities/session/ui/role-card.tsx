"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/shared/ui";

/** 역할 카드 — 목업 .roles/.role 그대로(로그인 창·계정 메뉴 「역할 바꾸기」가 같이 쓴다) */
export function RoleGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-2">{children}</div>;
}

export function RoleCard({ icon, label, desc, pressed, onClick }: { icon: IconName; label: string; desc: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="flex items-start gap-3 rounded-md border border-line-strong bg-s2 px-4 py-3 text-left transition-[border-color,background-color] duration-(--dur-fast) ease-em hover:border-t2 aria-pressed:border-t1 aria-pressed:bg-(--accent-soft)"
    >
      <span className="grid size-[34px] flex-none place-items-center rounded-sm bg-s3 text-t2 [&_svg]:size-[18px]">
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <b className="block text-fs3">{label}</b>
        <span className="mt-1 block text-fs2 leading-[1.45] text-t2">{desc}</span>
      </span>
    </button>
  );
}
