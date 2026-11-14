import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  Copy,
  Download,
  ChartColumn,
  Check,
  ChevronDown,
  Compass,
  FlaskConical,
  Info,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Ruler,
  Siren,
  TriangleAlert,
  Truck,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";

/**
 * 목업 EM.icon(이름) → lucide 대응표. 목업 아이콘 이름을 그대로 키로 쓴다.
 * 로고 표지처럼 lucide 에 없는 것은 shared/ui/logo.tsx 같은 자체 SVG 로 둔다.
 * 크기는 토큰(--ic-inline · --ic-btn · --ic-nav)을 따른다 — 기기군 블록이 값을 바꾼다.
 */
const MAP = {
  calendar: CalendarDays,
  activity: Activity,
  book: BookOpen,
  grid: LayoutGrid,
  siren: Siren,
  ruler: Ruler,
  chart: ChartColumn,
  flask: FlaskConical,
  truck: Truck,
  compass: Compass,
  bell: Bell,
  user: User,
  chevD: ChevronDown,
  x: X,
  login: LogIn,
  logout: LogOut,
  check: Check,
  info: Info,
  alert: TriangleAlert,
  lock: Lock,
  download: Download,
  copy: Copy,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof MAP;

const SIZE = {
  inline: "ic-inline",
  btn: "ic-btn",
  nav: "ic-nav",
} as const;

/** 목업 아이콘과 같은 선 굵기(1.9) · 장식(aria-hidden). 뜻은 단추의 접근 이름이 말한다 */
export function Icon({ name, size = "btn", className }: { name: IconName; size?: keyof typeof SIZE; className?: string }) {
  const C = MAP[name];
  return <C aria-hidden="true" strokeWidth={1.9} className={cn("flex-none", SIZE[size], className)} />;
}
