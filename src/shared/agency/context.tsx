"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AgencyPort } from "./port";

/**
 * 어댑터 주입 자리. 어느 어댑터를 넣을지는 조립 지점(src/app/boot/adapters.ts) 한 곳만 정한다.
 * 화면·위젯은 useAgency() 로 포트만 받는다 — 목 모듈을 직접 import 하면 검사(check-isolation)가 실패한다.
 */
const Ctx = createContext<AgencyPort | null>(null);

export function AgencyProvider({ port, children }: { port: AgencyPort; children: ReactNode }) {
  return <Ctx.Provider value={port}>{children}</Ctx.Provider>;
}

export function useAgency(): AgencyPort {
  const p = useContext(Ctx);
  if (!p) throw new Error("AgencyProvider 밖에서 useAgency() 를 불렀다");
  return p;
}
