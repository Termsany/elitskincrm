import Link from "next/link";

/** Small "open the report" chip used inside pages; every link lands on the same report engine (/admin/reports). */
export default function ReportLink({ href, label = "تقرير", className = "" }: { href: string; label?: string; className?: string }) {
  return <Link href={href} className={`es-report-link inline-flex items-center gap-1.5 rounded-xl border border-[var(--sky-border)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--navy)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--navy-3)] hover:shadow-md ${className}`}>
    <span aria-hidden>📊</span>{label}<span aria-hidden className="transition group-hover:-translate-x-0.5">‹</span>
  </Link>;
}
