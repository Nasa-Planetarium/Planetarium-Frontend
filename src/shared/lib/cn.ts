import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * shadcn 관례의 className 합치기.
 * 토큰 별칭 글자 크기(text-fs1 … text-count)를 글자 크기 묶음으로 알려 준다 —
 * 알려 주지 않으면 tailwind-merge 가 text-fs3 와 text-t1(글자색)을 같은 묶음으로 보고 하나를 지운다.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["fs1", "fs2", "fs3", "fs4", "body", "row", "stat", "sec", "title", "page", "count", "mark"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
