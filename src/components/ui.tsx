export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white border border-[var(--border)] shadow-sm ${className}`}>{children}</div>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "warn" | "danger" | "neutral" | "info";
}) {
  const map: Record<string, string> = {
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-red-50 text-red-800 border-red-200",
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
    info: "bg-sky-50 text-sky-800 border-sky-200",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[tone]}`}>{children}</span>;
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const v =
    variant === "primary"
      ? "bg-[var(--gold)] text-[var(--navy)] hover:bg-[var(--gold-2)] shadow-sm border border-transparent"
      : variant === "outline"
        ? "border border-[var(--border)] bg-white hover:bg-slate-50 text-[var(--ink)]"
        : "hover:bg-slate-100 text-[var(--ink)]";
  return (
    <button className={`${base} ${v} ${props.className || ""}`} {...props}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-soft)] transition ${props.className || ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-soft)] transition ${props.className || ""}`}
    />
  );
}

export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-semibold text-[var(--muted)] flex items-center gap-1">
      {children}
      {required && <span className="text-red-600 font-bold">*</span>}
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-soft)] transition ${props.className || ""}`}
    />
  );
}

/* ── Stepper: matches NewVisitClient header ── */
export function Stepper({
  steps,
  current,
}: {
  steps: number;
  current: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1.5">
        {Array.from({ length: steps }).map((_, i) => (
          <span key={i} className={`h-2 w-8 rounded-full transition ${i + 1 <= current ? "bg-[var(--gold)]" : "bg-white/20"}`} />
        ))}
      </div>
      <span className="text-[11px] text-white/60">خطوة {current} من {steps}</span>
    </div>
  );
}

/* Light variant for use on white backgrounds */
export function StepperLight({
  steps,
  current,
}: {
  steps: number;
  current: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: steps }).map((_, i) => (
        <span
          key={i}
          className={`h-2 rounded-full transition-all ${i + 1 <= current ? "w-8 bg-[var(--navy)]" : i + 1 === current + 1 ? "w-8 bg-[var(--gold)]/40" : "w-2 bg-[var(--border)]"}`}
        />
      ))}
    </div>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string; icon?: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const cols = options.length === 4 ? "grid-cols-4" : options.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`grid ${cols} gap-2`}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-xl border-2 py-2.5 flex flex-col items-center gap-0.5 font-bold text-xs sm:text-sm transition ${
              active
                ? "bg-[var(--navy)] text-white border-[var(--navy)] shadow-md"
                : "bg-white border-[var(--border)] text-[var(--muted)] hover:border-[var(--navy)]/25 hover:text-[var(--navy)]"
            }`}
          >
            {o.icon && <span className="text-base leading-none">{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  sub: string;
  icon?: string;
  variant?: "default" | "navy";
}) {
  if (variant === "navy") {
    return (
      <div className="rounded-2xl bg-[var(--navy)] text-white p-4 relative overflow-hidden shadow-sm border border-[var(--navy)]">
        <div className="absolute top-0 inset-x-0 h-1 bg-[var(--gold)]" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-white/60 font-semibold">{label}</div>
            <div className="text-3xl font-extrabold text-[var(--gold)] mt-1">{value}</div>
            <div className="text-[11px] text-white/50 mt-1">{sub}</div>
          </div>
          {icon && (
            <span className="h-10 w-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-lg shrink-0">
              {icon}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-sm p-4 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-1 bg-[var(--gold)]" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--muted)] font-semibold">{label}</div>
          <div className="text-3xl font-extrabold text-[var(--navy)] mt-1">{value}</div>
          <div className="text-[11px] text-[var(--muted)] mt-1">{sub}</div>
        </div>
        {icon && (
          <span className="h-10 w-10 rounded-xl bg-[var(--navy)] text-[var(--gold)] flex items-center justify-center text-base shrink-0">
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "◎",
  title,
  desc,
  action,
}: {
  icon?: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 flex flex-col items-center text-center px-6">
      <div className="h-16 w-16 rounded-2xl bg-[var(--gold-soft)] border border-[var(--gold)]/20 flex items-center justify-center text-2xl text-[var(--navy)]">
        {icon}
      </div>
      <div className="font-extrabold text-[var(--navy)] mt-4">{title}</div>
      {desc && <div className="text-sm text-[var(--muted)] mt-1 max-w-[32ch]">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
