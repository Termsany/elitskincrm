/* Elite Skin brand lockup — ES monogram medallion + wordmark.
   tone="onDark" for charcoal surfaces (sidebar, login),
   tone="onLight" for white cards. */

type Tone = "onDark" | "onLight";
type Variant = "stacked" | "lockup" | "mark";

function Monogram({ size = 44, tone = "onDark" }: { size?: number; tone?: Tone }) {
  const uid = tone === "onDark" ? "d" : "l";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role="img" aria-label="Elite Skin">
      <defs>
        <linearGradient id={`rose-${uid}`} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#edc6ba" />
          <stop offset="0.5" stopColor="#c6877b" />
          <stop offset="1" stopColor="#a96f63" />
        </linearGradient>
        <linearGradient id={`char-${uid}`} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3a3442" />
          <stop offset="1" stopColor="#211d26" />
        </linearGradient>
      </defs>
      {/* medallion */}
      <rect
        x="1.25" y="1.25" width="45.5" height="45.5" rx="13.5"
        fill={tone === "onDark" ? `url(#rose-${uid})` : `url(#char-${uid})`}
        stroke={tone === "onDark" ? "#f0d3ca" : `url(#rose-${uid})`}
        strokeWidth="1.3"
      />
      {/* ES monogram */}
      <text
        x="24" y="25.5" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Playfair Display', Georgia, serif" fontSize="21" fontWeight="600"
        letterSpacing="0.5"
        fill={tone === "onDark" ? "#241f29" : `url(#rose-${uid})`}
      >ES</text>
      {/* glow accent */}
      <circle cx="37" cy="11.5" r="1.7" fill={tone === "onDark" ? "#fff4ef" : "#edc6ba"} opacity="0.95" />
    </svg>
  );
}

export function Logo({
  variant = "stacked",
  tone = "onDark",
  markSize = 44,
  className = "",
  tagline,
}: {
  variant?: Variant;
  tone?: Tone;
  markSize?: number;
  className?: string;
  tagline?: string;
}) {
  const ink = tone === "onDark" ? "text-white" : "text-[var(--ink)]";
  const sub = tone === "onDark" ? "text-white/60" : "text-[var(--muted)]";

  if (variant === "mark") return <span className={className}><Monogram size={markSize} tone={tone} /></span>;

  const wordmark = (
    <span className="leading-none">
      <span className={`font-display font-semibold tracking-[0.2em] ${ink}`}>ELITE </span>
      <span className="font-display font-semibold tracking-[0.2em] text-[var(--gold)]">SKIN</span>
    </span>
  );

  if (variant === "lockup") {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <Monogram size={markSize} tone={tone} />
        <span className="flex flex-col gap-0.5">
          <span className="text-base">{wordmark}</span>
          {tagline && <span className={`text-[10px] ${sub}`}>{tagline}</span>}
        </span>
      </span>
    );
  }

  // stacked
  return (
    <span className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <Monogram size={markSize} tone={tone} />
      <span className="text-center">
        <span className="text-xl">{wordmark}</span>
        {tagline && <span className={`mt-1 block text-[11px] ${sub}`}>{tagline}</span>}
      </span>
    </span>
  );
}

export default Logo;
