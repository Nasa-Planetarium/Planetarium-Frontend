"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * next/navigation 의 null 가능 반환을 감싼다. 루트에 빈 pages/ 가 있어(FSD 층 이름 때문) Next 가 Pages Router 호환 타입(null 가능)을 준다.
 * 이 앱은 App Router 만 쓰므로 실제로는 null 이 아니다 — 그래도 빈 값으로 안전하게 떨어진다.
 */
export function useQueryParams(): Pick<URLSearchParams, "get" | "toString"> {
  return useSearchParams() ?? new URLSearchParams();
}

export function usePath(): string {
  return usePathname() ?? "/";
}
