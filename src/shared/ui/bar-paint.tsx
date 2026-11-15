/**
 * 막대 칠 부품(2026-11-15) — 캘린더 「같은 달 연도별」과 비교 분석 「날짜 범위 추이」가 같은 모양을 쓴다.
 * 보통 막대 = 위 주황 갈색 → 아래 어두운 갈색(--yb-base-*) · 고른(분석) 막대 = 노랑 → 주황 → 분홍빛 빨강(--yb-eval-*) + 은은한 빛 · 결측 = 빗금.
 * 가로 막대 = `${p}bx`(왼쪽 어두운 갈색 → 오른쪽 주황 갈색).
 * <svg><defs><BarPaintDefs id={p} /></defs> 를 두고 fill={`url(#${p}b)`} · fill={`url(#${p}e)`} filter={`url(#${p}g)`} · fill={`url(#${p}h)`} 로 쓴다.
 */
export function BarPaintDefs({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--yb-base-top)" />
        <stop offset="1" stopColor="var(--yb-base-bot)" />
      </linearGradient>
      <linearGradient id={`${id}bx`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--yb-base-bot)" />
        <stop offset="1" stopColor="var(--yb-base-top)" />
      </linearGradient>
      <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--yb-eval-a)" />
        <stop offset="0.45" stopColor="var(--yb-eval-b)" />
        <stop offset="1" stopColor="var(--yb-eval-c)" />
      </linearGradient>
      <filter id={`${id}g`} x="-60%" y="-30%" width="220%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="bl" />
        <feFlood floodColor="var(--yb-eval-glow)" floodOpacity="0.45" />
        <feComposite in2="bl" operator="in" result="gl" />
        <feMerge>
          <feMergeNode in="gl" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <pattern id={`${id}h`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="var(--hatch-bg)" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="var(--text-3)" strokeWidth="1.6" />
      </pattern>
    </>
  );
}

/** 윗모서리만 둥근 막대 경로(바닥은 x축에 붙는다) */
export function topRoundPath(x: number, y: number, w: number, h: number, rMax = 3) {
  const r = Math.max(0, Math.min(rMax, w / 2, h));
  return `M${x.toFixed(1)} ${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z`;
}
