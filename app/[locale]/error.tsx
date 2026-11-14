"use client";

import { RenderError } from "@/widgets/page-frame";

// 화면(경로 page)이 그리다 던지면 머리줄은 남기고 본문 자리에 오류 상자(목업 route 의 catch)
export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RenderError error={error} />;
}
