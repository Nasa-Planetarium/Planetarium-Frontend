/**
 * 브라우저 MSW 시작(정적 내보내기에서도 동작: public/mockServiceWorker.js 를 같은 출처에서 등록).
 * src/app/boot/data-boot.tsx 만 이 파일을 동적 import 한다 — DATA_MODE=http 빌드에서는 불리지 않는다.
 * 처리기가 없는 요청(사전·geo·이미지 등)은 그대로 통과(bypass).
 */
import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers";

export async function startMsw(base: string) {
  const worker = setupWorker(...createHandlers(base));
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
  return worker;
}
