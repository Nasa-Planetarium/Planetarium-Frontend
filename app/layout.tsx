import type { ReactNode } from "react";

/**
 * 뿌리 레이아웃은 그대로 넘긴다. <html> 은 언어를 아는 app/[locale]/layout.tsx 가 그린다(next-intl 정적 내보내기 방식).
 * 루트 / (app/page.tsx)와 404(app/not-found.tsx)는 각자 <html> 을 가진다.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
