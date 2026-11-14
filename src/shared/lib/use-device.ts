"use client";

import { useSyncExternalStore } from "react";
import type { Device } from "./device-script";

export type { Device };

declare global {
  interface Window {
    EM_APPLY_DEVICE?: () => { device: Device; touch: boolean; cover: boolean } | null;
  }
}

const read = (): Device => {
  const d = document.documentElement.getAttribute("data-device");
  return d === "tablet" || d === "phone" || d === "foldable" ? d : "web";
};

/** 창 크기가 바뀌면 140ms 뒤 다시 판정해 html 속성을 바꾸고 알린다(목업 EM.detectDevice + resize) */
function subscribe(cb: () => void) {
  let t = 0;
  const on = () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      window.EM_APPLY_DEVICE?.();
      cb();
    }, 140);
  };
  window.addEventListener("resize", on);
  return () => {
    window.removeEventListener("resize", on);
    window.clearTimeout(t);
  };
}

/** 지금 기기군(html[data-device] — app/[locale]/layout.tsx 첫 스크립트가 단다). 서버 렌더 값은 web */
export function useDevice(): Device {
  return useSyncExternalStore(subscribe, read, () => "web");
}
