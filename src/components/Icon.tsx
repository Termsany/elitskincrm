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
  Check,
  Clock,
  X,
  Star,
  Pencil,
  Sparkles,
  Target,
  FlaskConical,
  ShieldCheck,
  Search,
  CircleDot,
  SearchX,
  AlertCircle,
  AlertTriangle,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";

// Fallback lucide icons (used for any name without a custom duotone drawing).
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
  library: FolderOpen,
  account: UserCircle,
  more: Menu,
  check: Check,
  clock: Clock,
  x: X,
  star: Star,
  edit: Pencil,
  sparkle: Sparkles,
  search: Search,
  coverage: Target,
  samples: FlaskConical,
  compliance: ShieldCheck,
  all: CircleDot,
  empty: SearchX,
  alert: AlertCircle,
  warn: AlertTriangle,
  circle: Circle,
};

/*
 * Elite Skin duotone icon set (24px grid, designed in Figma: "Elite Skin CRM — Navigation & Icons").
 * Each icon has two layers:
 *   duo  → soft filled shape, opacity driven by the CSS var --ico-duo (0.16 by default, stronger when active)
 *   line → the outline, drawn with currentColor
 */
type Duo = { duo: string; line: string };
const DUO: Record<string, Duo> = {
  dashboard: { duo: '<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/>', line: '<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="3" width="8" height="6" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/><rect x="3" y="15" width="8" height="6" rx="2"/>' },
  doctors: { duo: '<path d="M3 4h10v5a5 5 0 0 1-10 0z"/><circle cx="18" cy="10" r="3"/>', line: '<path d="M5 3H4a1 1 0 0 0-1 1v5a5 5 0 0 0 10 0V4a1 1 0 0 0-1-1h-1"/><path d="M8 14v1a5 5 0 0 0 10 0v-3"/><circle cx="18" cy="10" r="2"/>' },
  clinic: { duo: '<rect x="4" y="4" width="12" height="17" rx="2"/>', line: '<path d="M4 21V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15"/><path d="M16 10h3a1 1 0 0 1 1 1v10"/><path d="M3 21h18"/><path d="M10 8v4"/><path d="M8 10h4"/><path d="M9 21v-4h2v4"/>' },
  visits: { duo: '<rect x="5" y="4" width="14" height="17" rx="2"/>', line: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M9 13l2 2 4-4"/>' },
  "new-visit": { duo: '<circle cx="12" cy="12" r="9"/>', line: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>' },
  calendar: { duo: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3z"/><rect x="7" y="13" width="4" height="4" rx="1"/>', line: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>' },
  plans: { duo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>', line: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14l2 2 4-4"/>' },
  products: { duo: '<path d="M3 8l9 5v8l-9-5z"/>', line: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>' },
  sales: { duo: '<path d="M3 17l6-6 4 4 8-8v14H3z"/>', line: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
  library: { duo: '<path d="M3 10h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', line: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' },
  reps: { duo: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0z"/>', line: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14.5a5 5 0 0 1 3.5 5.5"/>' },
  reports: { duo: '<rect x="10.5" y="6" width="3" height="14" rx="1"/>', line: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="9" rx="1"/><rect x="10.5" y="6" width="3" height="14" rx="1"/><rect x="15.5" y="14" width="3" height="6" rx="1"/>' },
  work: { duo: '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4H3z"/>', line: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>' },
  account: { duo: '<circle cx="12" cy="8" r="4"/>', line: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' },
  more: { duo: '<circle cx="19" cy="18" r="2.5"/>', line: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>' },
  search: { duo: '<circle cx="11" cy="11" r="7"/>', line: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>' },
  bell: { duo: '<path d="M6 9a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7z"/>', line: '<path d="M6 9a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7"/><path d="M10 20a2 2 0 0 0 4 0"/>' },
  samples: { duo: '<path d="M9.5 10h5v5.5a2.5 2.5 0 0 1-5 0z"/>', line: '<path d="M14.5 3v12.5a2.5 2.5 0 0 1-5 0V3"/><path d="M8 3h8"/><path d="M9.5 10h5"/>' },
  flag: { duo: '<path d="M5 4h11l-2 4 2 4H5z"/>', line: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>' },
  trophy: { duo: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/>', line: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4"/><path d="M8 21h8"/><path d="M10 18h4"/>' },
  warn: { duo: '<path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.5 13A2 2 0 0 1 19.5 20h-15a2 2 0 0 1-1.7-2.8z"/>', line: '<path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.5 13A2 2 0 0 1 19.5 20h-15a2 2 0 0 1-1.7-2.8z"/><path d="M12 9.5v4"/><path d="M12 16.5v.5"/>' },
  sparkle: { duo: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', line: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5v4"/><path d="M17 17.5h4"/>' },
  collapse: { duo: '<path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4z"/>', line: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="M10 10l-2 2 2 2"/>' },
  signature: { duo: '<path d="M14.5 4.5l5 5L9 20H4v-5z"/>', line: '<path d="M14.5 4.5l2-2a1.4 1.4 0 0 1 2 0l3 3a1.4 1.4 0 0 1 0 2l-2 2"/><path d="M14.5 4.5l5 5L9 20H4v-5z"/>' },
  file: { duo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>', line: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>' },
  coverage: { duo: '<circle cx="12" cy="12" r="5"/>', line: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>' },
  repeat: { duo: '<circle cx="12" cy="12" r="6"/>', line: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>' },
  send: { duo: '<path d="M21 3L3 10.5l7 3.5z"/>', line: '<path d="M21 3L3 10.5l7 3.5 3.5 7z"/><path d="M10 14l11-11"/>' },
  upload: { duo: '<path d="M4 15h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>', line: '<path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 15V4"/><path d="M7 9l5-5 5 5"/>' },
  time: { duo: '<circle cx="12" cy="13" r="8"/>', line: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M5 3L2 6"/><path d="M19 3l3 3"/>' },
  wallet: { duo: '<path d="M3 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', line: '<path d="M19 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5"/><path d="M16 14h2"/>' },
  fuel: { duo: '<rect x="4" y="9" width="10" height="12" rx="1"/>', line: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M4 9h10"/><path d="M14 12h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V8l-3-3"/>' },
  parking: { duo: '<rect x="3" y="3" width="18" height="18" rx="4"/>', line: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>' },
  hospitality: { duo: '<path d="M3 11h18a9 9 0 0 1-18 0z"/>', line: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M12 7V4"/><path d="M8 7.5c0-1 1-1.5 1-2.5"/><path d="M16 7.5c0-1-1-1.5-1-2.5"/>' },
  gift: { duo: '<rect x="4" y="11" width="16" height="10" rx="1"/>', line: '<rect x="3" y="7" width="18" height="4" rx="1"/><path d="M4 11v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/><path d="M12 7v14"/><path d="M12 7S10.5 3 8 3.5 7 7 12 7z"/><path d="M12 7s1.5-4 4-3.5S17 7 12 7z"/>' },
  events: { duo: '<path d="M4 4h16v11H4z"/>', line: '<rect x="3" y="4" width="18" height="11" rx="1"/><path d="M12 15v4"/><path d="M8 21l4-2 4 2"/><path d="M7 11l3-3 2 2 4-4"/>' },
  travel: { duo: '<path d="M2 16l20-6-4-3-6 2-6-4-2 1 4 5-4 1-2-1z"/>', line: '<path d="M2 16l20-6c0-1.5-1.5-3-4-3l-6 2-6-4-2 1 4 5-4 1-2-1z"/><path d="M3 21h18"/>' },
  phone: { duo: '<rect x="6" y="2" width="12" height="20" rx="3"/>', line: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>' },
  pen: { duo: '<path d="M4 20v-4L15 5l4 4L8 20z"/>', line: '<path d="M4 20v-4L15 5l4 4L8 20z"/><path d="M13 7l4 4"/>' },
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 2,
  className,
  fill,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  fill?: string;
}) {
  const d = DUO[name];
  if (d) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Math.min(strokeWidth, 1.85)} strokeLinecap="round" strokeLinejoin="round" className={`es-ico es-ico-${name}${className ? ` ${className}` : ""}`} aria-hidden="true">
      <g className="es-ico-duo" fill="currentColor" stroke="none" dangerouslySetInnerHTML={{ __html: d.duo }} />
      <g className="es-ico-line" dangerouslySetInnerHTML={{ __html: d.line }} />
    </svg>;
  }
  const Cmp = ICONS[name] ?? Circle;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} fill={fill} aria-hidden="true" />;
}

/* Legacy emoji glyphs (still produced by some data sources) → duotone icon + brand tone. */
const GLYPH: Record<string, [string, string]> = {
  "🚩": ["flag", "#ef4b4e"], "🗓": ["calendar", "#e99608"], "💰": ["sales", "#1aa865"], "🩺": ["doctors", "#3b90e8"],
  "🔁": ["repeat", "#3b90e8"], "🏆": ["trophy", "#1aa865"], "👤": ["account", "#10484f"], "💊": ["products", "#9676e3"],
  "📄": ["file", "#10484f"], "🖋": ["signature", "#9676e3"], "📨": ["send", "#3b90e8"], "⚡": ["sparkle", "#e99608"],
  "📋": ["visits", "#33b3a6"], "📊": ["reports", "#e16201"], "📈": ["sales", "#1aa865"], "⬆": ["upload", "#10484f"],
  "🧭": ["calendar", "#3b90e8"], "📑": ["reports", "#e16201"], "👥": ["reps", "#33b3a6"], "🧪": ["samples", "#9676e3"],
  "⏰": ["time", "#ef4b4e"], "✎": ["pen", "#e99608"], "🔎": ["search", "#10484f"], "⚠": ["warn", "#e99608"], "💵": ["wallet", "#e16201"],
};
export function glyphIcon(g: string): [string, string] | null {
  return GLYPH[g] ?? GLYPH[g.replace(/️/g, "")] ?? null;
}

/** Renders a legacy emoji glyph as a duotone icon. `chip` wraps it in a tinted rounded square. */
export function GlyphIcon({ g, size = 18, chip = false, plain = false, box = 36, className = "" }: { g: string; size?: number; chip?: boolean; plain?: boolean; box?: number; className?: string }) {
  const m = glyphIcon(g);
  if (!m) return chip ? <span className={`flex shrink-0 items-center justify-center rounded-xl bg-[var(--bg)] text-base ${className}`} style={{ width: box, height: box }}>{g}</span> : <span className={className}>{g}</span>;
  const [name, color] = m;
  if (!chip) return <Icon name={name} size={size} className={className} {...(plain ? {} : {})} />;
  return <span className={`es-chip flex shrink-0 items-center justify-center rounded-xl ${className}`} style={{ width: box, height: box, color, background: `${color}1f` }}>
    <Icon name={name} size={size} />
  </span>;
}
