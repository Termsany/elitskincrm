/** Kinds of non-visit work a rep can log. */
export const OFFICE_KINDS: Record<string, { label: string; icon: string }> = {
  office: { label: "شغل مكتبي", icon: "💼" },
  meeting: { label: "اجتماع", icon: "👥" },
  training: { label: "تدريب", icon: "🎓" },
  delivery: { label: "تسليم / مخزن", icon: "📦" },
  errand: { label: "مشوار إداري", icon: "🏛️" },
  other: { label: "حاجة تانية", icon: "✏️" },
};
/** A field day is 8 hours; office time beyond that still counts as a full day. */
export const DAY_MIN = 480;
