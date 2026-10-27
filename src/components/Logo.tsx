/* Elite Skin brand lockup — ES monogram medallion + wordmark.
   tone="onDark" for teal surfaces (sidebar), tone="onLight" for white cards. */

type Tone = "onDark" | "onLight";
type Variant = "stacked" | "lockup" | "mark";

function Monogram({ size = 44, tone = "onDark" }: { size?: number; tone?: Tone }) {
  const uid = tone === "onDark" ? "d" : "l";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role="img" aria-label="Elite Skin">
      <defs>
        <linearGradient id={`teal-${uid}`} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4fc9bd" />
          <stop offset="0.5" stopColor="#1f8d8a" />
          <stop offset="1" stopColor="#116069" />
        </linearGradient>
        <linearGradient id={`deep-${uid}`} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#15545e" />
          <stop offset="1" stopColor="#0d3c43" />
        </linearGradient>
      </defs>
      <rect
        x="1.25" y="1.25" width="45.5" height="45.5" rx="13.5"
        fill={tone === "onDark" ? `url(#teal-${uid})` : `url(#deep-${uid})`}
        stroke={tone === "onDark" ? "#bfeae4" : `url(#teal-${uid})`}
        strokeWidth="1.3"
      />
      <text
        x="24" y="25.5" textAnchor="middle" dominantBaseline="central"
        fontFamily="'Alexandria', 'IBM Plex Sans Arabic', system-ui, sans-serif"
        fontSize="19" fontWeight="700" letterSpacing="0.5"
        fill={tone === "onDark" ? "#ffffff" : `url(#teal-${uid})`}
      >ES</text>
      <circle cx="37" cy="11.5" r="1.7" fill={tone === "onDark" ? "#eafaf7" : "#4fc9bd"} opacity="0.95" />
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
  const skin = tone === "onDark" ? "text-[var(--sky)]" : "text-[var(--gold)]";

  if (variant === "mark") return <span className={className}><Monogram size={markSize} tone={tone} /></span>;

  const wordmark = (
    <span className="leading-none">
      <span className={`font-display font-bold tracking-[0.14em] ${ink}`}>ELITE </span>
      <span className={`font-display font-bold tracking-[0.14em] ${skin}`}>SKIN</span>
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
