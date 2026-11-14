/**
 * 시각 글자 — 목업 core.js tzParts·localHM·tzAbbr·tzOffsetMin 이식(같은 입력 → 같은 문자열, time.test.ts).
 * next-intl useFormatter 를 쓰지 않는 이유: 목업 서식과 바이트 단위로 맞추기 위해(설계 §6.3).
 */
const p2 = (n: number) => String(n).padStart(2, "0");

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtOf(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function tzParts(ms: number, tz: string): TzParts {
  const o: Record<string, number> = {};
  for (const p of fmtOf(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { year: o.year ?? 1970, month: o.month ?? 1, day: o.day ?? 1, hour: (o.hour ?? 0) % 24, minute: o.minute ?? 0, second: o.second ?? 0 };
}

/** 그 시간대의 UTC 차이(분) */
export function tzOffsetMin(tz: string, ms: number = Date.now()): number {
  const t = Math.floor(ms / 1000) * 1000;
  const o = tzParts(t, tz);
  return Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - t) / 60000);
}

export const localHM = (ms: number, tz: string) => {
  const o = tzParts(ms, tz);
  return `${p2(o.hour)}:${p2(o.minute)}`;
};

const TZ_ABBR: Record<string, string> = { "Asia/Seoul": "KST", "Asia/Tokyo": "JST", UTC: "UTC", "Etc/UTC": "UTC" };

/** 시간대 약어: 짧은 덮어쓰기 표 → Intl 짧은 이름 → GMT±h 꼴은 UTC±h (목업 EM.tzAbbr) */
export function tzAbbr(tz: string, ms: number = Date.now()): string {
  const hit = TZ_ABBR[tz];
  if (hit) return hit;
  let s = "";
  try {
    s =
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date(ms))
        .find((x) => x.type === "timeZoneName")?.value ?? "";
  } catch {
    s = "";
  }
  if (!s || /^GMT/.test(s)) {
    const off = tzOffsetMin(tz, ms);
    const a = Math.abs(off);
    s = off === 0 ? "UTC" : `UTC${off > 0 ? "+" : "−"}${Math.floor(a / 60)}${a % 60 ? `:${p2(a % 60)}` : ""}`;
  }
  return s;
}

/** "2026-11-11 14:20" 를 그 시간대 벽시계로 읽어 epoch ms (목업 EM.parseLocal) */
export function parseLocal(str: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(str);
  if (!m) return NaN;
  const naive = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let off = tzOffsetMin(tz, naive);
  off = tzOffsetMin(tz, naive - off * 60000);
  return naive - off * 60000;
}
