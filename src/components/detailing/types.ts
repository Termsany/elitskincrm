export type Brochure = { id: string; title: string; file_name: string; mime: string; size_bytes: number; pages: number; sort_order: number; active: boolean; updated_at: string };
export type DetailProduct = {
  id: string; name: string; tagline: string; category: string; color: string; description: string;
  detailing_points: string; key_questions: string; detailing_version: string; content_updated_at?: string;
  image_available: boolean; brochures: Brochure[];
};
export type Reaction = "interested" | "neutral" | "not_interested";
export type PresenterResult = { reactions: Record<string, Reaction>; shown: string[]; seconds: number };
export const REACTIONS: Array<[Reaction, string, string]> = [["interested", "مهتم", "👍"], ["neutral", "محايد", "😐"], ["not_interested", "غير مهتم", "👎"]];
export const lines = (s: string) => s.split(/\r?\n/).map(x => x.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
export const imageUrl = (id: string, admin = false) => admin ? `/api/admin/products/${id}/image` : `/api/products/${id}/image`;
