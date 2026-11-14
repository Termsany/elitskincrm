import { query } from "@/lib/db";
import { normWeights, type Goals } from "@/lib/fin-goals";

export async function loadGoals(year: number): Promise<Goals | null> {
  const r = await query<{ data: Goals }>("SELECT data FROM fin_goals WHERE year=$1", [year]);
  const g = r.rows[0]?.data; return g ? { ...g, weights: normWeights(g.weights) } : null;
}
