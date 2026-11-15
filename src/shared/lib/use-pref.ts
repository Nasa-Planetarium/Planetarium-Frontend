"use client";

import { useCallback, useSyncExternalStore } from "react";
import { prefs } from "./prefs";

const EVT = "em:pref";

/** 저장값(prefs — 탭 안 sessionStorage) 하나를 여러 컴포넌트가 같이 읽고 쓴다(예 clockUTC — 머리줄 시계와 계정 메뉴) */
export function usePref(key: string): [string | null, (v: string | null) => void] {
  const subscribe = useCallback((cb: () => void) => {
    const on = (e: Event) => {
      if (!(e instanceof CustomEvent) || e.detail === key) cb();
    };
    window.addEventListener(EVT, on);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", cb);
    };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => prefs.get(key), () => null);
  const set = useCallback(
    (v: string | null) => {
      prefs.set(key, v);
      window.dispatchEvent(new CustomEvent(EVT, { detail: key }));
    },
    [key],
  );
  return [value, set];
}
