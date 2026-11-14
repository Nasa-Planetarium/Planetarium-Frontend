"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AuthPort } from "./port";

/** 인증 어댑터 주입 자리(조립 지점 src/app/boot/adapters.ts 가 정함) */
const Ctx = createContext<AuthPort | null>(null);

export function AuthProvider({ port, children }: { port: AuthPort; children: ReactNode }) {
  return <Ctx.Provider value={port}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthPort {
  const p = useContext(Ctx);
  if (!p) throw new Error("AuthProvider 밖에서 useAuth() 를 불렀다");
  return p;
}
