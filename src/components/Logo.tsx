/* eliteSkin brand lockup — official mark + wordmark (images in /public/brand).
   tone="onDark" for teal surfaces (sidebar, headers), tone="onLight" for white cards. */

type Tone = "onDark" | "onLight";
type Variant = "stacked" | "lockup" | "mark" | "full";

const WORD_RATIO = 1280 / 283; // wordmark width / height
const MARK_RATIO = 713 / 747;

export function BrandMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.png" alt="eliteSkin" width={Math.round(size * MARK_RATIO)} height={size} className={`shrink-0 select-none ${className}`} draggable={false} />;
}

export function Wordmark({ height = 22, tone = "onDark", className = "" }: { height?: number; tone?: Tone; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={tone === "onDark" ? "/brand/wordmark-white.png" : "/brand/wordmark.png"} alt="eliteSkin" width={Math.round(height * WORD_RATIO)} height={height} className={`select-none ${className}`} draggable={false} />;
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
  const sub = tone === "onDark" ? "text-white/60" : "text-[var(--muted)]";

  if (variant === "mark") return <span className={className}><BrandMark size={markSize} /></span>;

  // full official logo (mark + wordmark + "ADVANCED AESTHETIC SOLUTIONS") — light backgrounds
  if (variant === "full") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/logo-full.png" alt="eliteSkin — Advanced Aesthetic Solutions" width={Math.round(markSize * 1771 / 1315)} height={markSize} className={`mx-auto select-none ${className}`} draggable={false} />;
  }

  if (variant === "lockup") {
    return (
      <span dir="ltr" className={`inline-flex items-center gap-2.5 ${className}`}>
        <BrandMark size={markSize} />
        <span className="flex flex-col items-start gap-1">
          <Wordmark height={Math.round(markSize * 0.5)} tone={tone} />
          {tagline && <span className={`text-[10px] ${sub}`}>{tagline}</span>}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <BrandMark size={markSize} />
      <Wordmark height={Math.round(markSize * 0.45)} tone={tone} />
      {tagline && <span className={`block text-[11px] ${sub}`}>{tagline}</span>}
    </span>
  );
}

export default Logo;
