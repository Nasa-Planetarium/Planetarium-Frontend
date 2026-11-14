// 자동 생성 — scripts/import-i18n.mjs. 손으로 고치지 말 것.
export const BUNDLES = ["analysis","calendar","cmd","data","home","lab","land","ops","shell"] as const;
export const loaders = {
  ko: () =>
    Promise.all([
      import("./ko/analysis.json"),
      import("./ko/calendar.json"),
      import("./ko/cmd.json"),
      import("./ko/data.json"),
      import("./ko/home.json"),
      import("./ko/lab.json"),
      import("./ko/land.json"),
      import("./ko/ops.json"),
      import("./ko/shell.json"),
    ]).then((m) => m.map((x) => x.default as Record<string, unknown>)),
  en: () =>
    Promise.all([
      import("./en/analysis.json"),
      import("./en/calendar.json"),
      import("./en/cmd.json"),
      import("./en/data.json"),
      import("./en/home.json"),
      import("./en/lab.json"),
      import("./en/land.json"),
      import("./en/ops.json"),
      import("./en/shell.json"),
    ]).then((m) => m.map((x) => x.default as Record<string, unknown>)),
} as const;
