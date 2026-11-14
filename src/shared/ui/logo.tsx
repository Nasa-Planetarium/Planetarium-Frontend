/** 로고 표지(목업 core.js LOGO 그대로). 양피지 색(--raw-paper)은 이 표지 한 곳에만 쓴다(DIRECTION-R8 §3.2) */
export function LogoMark() {
  return (
    <svg
      className="flex-none text-paper-mark"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <path d="M3 10.5A9.6 9.6 0 0 1 19.6 6.4" strokeWidth="1.6" />
      <circle cx="20.6" cy="7.6" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="6" strokeWidth="2" />
      <circle cx="12" cy="15" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
