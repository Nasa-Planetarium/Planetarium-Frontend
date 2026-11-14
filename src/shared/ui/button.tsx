import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * 목업 .btn 그대로(index.html 「공통 부품」).
 * - 보조 = surface-2 면, 테두리 없음 · 주 = 흰 면(text-1) + 바탕색 글자, 화면당 하나 · danger 는 출동 지시만
 * - 반경 --r-s(4px), 그림자 없음. shadcn Button 의 기본 모양은 쓰지 않는다.
 */
export const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 ctl px-3 rounded-sm border border-transparent bg-s2 text-t1 text-fs3 font-medium whitespace-nowrap transition-[background-color,border-color] duration-(--dur-fast) ease-em hover:bg-s3 disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:ic-btn",
  {
    variants: {
      kind: {
        secondary: "",
        primary:
          "bg-(--accent) border-(--accent) text-(--on-accent) font-strong hover:bg-(--accent-strong) hover:border-(--accent-strong)",
        danger: "bg-alert-4-strong border-alert-4-strong text-(--on-alert-strong) hover:bg-alert-4-strong",
        ghost: "bg-transparent text-t2 hover:text-t1 hover:bg-s3",
      },
      size: {
        md: "",
        sm: "ctl-sm px-2 text-fs2 hit-after",
      },
      /** surface-2 위(대화상자·서랍·머리줄)에서는 한 단 올린 surface-3 */
      raised: { true: "bg-s3 hover:bg-line-soft", false: "" },
    },
    compoundVariants: [{ kind: "primary", raised: true, className: "bg-(--accent) hover:bg-(--accent-strong)" }],
    defaultVariants: { kind: "secondary", size: "md", raised: false },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, kind, size, raised, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ kind, size, raised }), className)} {...rest} />;
}

/** 목업 .iconbtn — 머리줄·대화상자의 네모 아이콘 단추(크기 --bar-btn) */
export const iconButtonClass =
  "relative grid place-items-center flex-none size-(--bar-btn) rounded-sm border border-transparent bg-transparent text-t1 transition-[background-color,border-color] duration-(--dur-fast) ease-em hover:bg-s3 hit-after [&_svg]:ic-nav";
