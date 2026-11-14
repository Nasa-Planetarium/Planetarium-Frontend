"use client";

import { useEffect } from "react";
import { DEFAULT_PAGE } from "@/shared/config";

export function RedirectToDefault({ locale }: { locale: string }) {
  useEffect(() => {
    window.location.replace(`/${locale}/${DEFAULT_PAGE}/${window.location.search}`);
  }, [locale]);
  return null;
}
