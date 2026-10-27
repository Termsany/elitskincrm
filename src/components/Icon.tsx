import {
  LayoutDashboard,
  Briefcase,
  Stethoscope,
  ClipboardList,
  PlusCircle,
  Package,
  TrendingUp,
  Users,
  BarChart3,
  Inbox,
  MapPin,
  Activity,
  ListChecks,
  CalendarDays,
  CalendarCheck,
  UserCircle,
  Menu,
  Circle,
  type LucideIcon,
} from "lucide-react";

// Maps a stable semantic name (used in nav config) to a real SVG icon.
// Icons inherit the parent text color via `currentColor`.
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  work: Briefcase,
  doctors: Stethoscope,
  visits: ClipboardList,
  "new-visit": PlusCircle,
  products: Package,
  sales: TrendingUp,
  reps: Users,
  reports: BarChart3,
  requests: Inbox,
  map: MapPin,
  "doctor-stats": Activity,
  tasks: ListChecks,
  calendar: CalendarDays,
  plans: CalendarCheck,
  account: UserCircle,
  more: Menu,
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 2,
  className,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Cmp = ICONS[name] ?? Circle;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
