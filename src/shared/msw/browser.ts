/**
 * 브라우저 MSW 시작(정적 내보내기에서도 동작: public/mockServiceWorker.js 를 같은 출처에서 등록).
 * src/app/boot/data-boot.tsx 만 이 파일을 동적 import 한다 — DATA_MODE=http 빌드에서는 불리지 않는다.
 * 처리기가 없는 요청(사전·geo·이미지 등)은 그대로 통과(bypass).
 */
import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers";

/**
 * 앞 페이지가 등록한 워커가 아직 활성화 중일 때 연 페이지는 「등록은 있는데 controller 가 없다」.
 * msw 는 이 경우 곧바로 location.reload() 를 부른다 → 그 사이 다른 이동(사용자 클릭·e2e page.goto)이 ERR_ABORTED 로 끊긴다
 * (aibox e2e shell.spec 「8개 경로」 40회 중 5회 재현, 2026-11-14. 시작점 = msw getWorkerInstance 의 reload).
 * 워커는 activate 에서 clients.claim() 을 하므로 controllerchange 를 잠깐 기다리면 다시 읽을 필요가 없다.
 * 끝내 안 오면(강력 새로고침처럼 claim 이 다시 안 오는 경우) 예전처럼 msw 가 다시 읽는다.
 */
async function awaitClaim(ms: number) {
  const sw = navigator.serviceWorker;
  if (!sw || sw.controller) return;
  const regs = await sw.getRegistrations();
  if (regs.length === 0 || sw.controller) return;
  await new Promise<void>((done) => {
    const timer = setTimeout(done, ms);
    sw.addEventListener(
      "controllerchange",
      () => {
        clearTimeout(timer);
        done();
      },
      { once: true },
    );
  });
}

export async function startMsw(base: string) {
  await awaitClaim(2000);
  const worker = setupWorker(...createHandlers(base));
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
  return worker;
}
