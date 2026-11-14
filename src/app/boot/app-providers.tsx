"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { ApiError } from "@/shared/api";
import { AgencyProvider } from "@/shared/agency";
import { AuthProvider } from "@/shared/auth";
import { createAgencyPort, createAuthPort } from "./adapters";
import { DataBoot } from "./data-boot";

/** GET 재시도: 네트워크·5xx·429 만, 0.5 · 1 · 2 초(목업 api.js 규칙). 4xx 는 다시 하지 않는다 */
const retry = (n: number, e: unknown) => n < 3 && (!(e instanceof ApiError) || e.status === 0 || e.status === 429 || e.status >= 500);
const retryDelay = (n: number) => 500 * 2 ** n;

/** 앱 전체 공급자: 사전(next-intl) · Query · 기관 연동 포트 · 인증 포트 · 데이터 시작 */
export function AppProviders({ locale, messages, children }: { locale: string; messages: AbstractIntlMessages; children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry, retryDelay, refetchOnWindowFocus: false } } }));
  const [agency] = useState(createAgencyPort);
  const [auth] = useState(createAuthPort);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="UTC"
      onError={() => {}}
      getMessageFallback={({ namespace, key }) => (namespace ? `${namespace}.${key}` : key)}
    >
      <QueryClientProvider client={qc}>
        <AgencyProvider port={agency}>
          <AuthProvider port={auth}>
            <DataBoot />
            {children}
          </AuthProvider>
        </AgencyProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
