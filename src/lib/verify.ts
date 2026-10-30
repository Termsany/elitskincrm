import { query } from "@/lib/db";

export type Verification = { found: boolean; ref?: string; signer?: string; signed_at?: string; name?: string; kinds?: string[]; sha256?: string; source?: "library" | "request"; intact?: boolean | null };

/** Public check of a signed document by reference number and/or SHA-256 fingerprint. Exposes no file contents. */
export async function verify(ref: string, hash: string): Promise<Verification> {
  ref = ref.trim().toUpperCase().replace(/^REF\s*/, ""); hash = hash.trim().toLowerCase();
  const okRef = /^[0-9A-F]{8}$/.test(ref), okHash = /^[0-9a-f]{64}$/.test(hash);
  if (!okRef && !okHash) return { found: false };
  const row = okRef
    ? (await query(`SELECT name, sha256, sign_meta FROM library_files WHERE signed AND sign_meta->>'ref'=$1 LIMIT 1`, [ref])).rows[0]
    : (await query(`SELECT name, sha256, sign_meta FROM library_files WHERE signed AND sha256=$1 LIMIT 1`, [hash])).rows[0];
  if (row) {
    const m = row.sign_meta || {};
    const kinds = [...new Set(((m.placements || []) as Array<{ kind?: string }>).map(p => p.kind === "stamp" ? "ختم" : "توقيع"))];
    return { found: true, source: "library", ref: m.ref, signer: m.signer, signed_at: m.signed_at, name: row.name, kinds, sha256: row.sha256, intact: okHash ? row.sha256 === hash : null };
  }
  if (okHash && !okRef) {
    const r = (await query(`SELECT r.signed_file_name, r.signed_at, r.signed_sha256, u.name signer FROM service_requests r LEFT JOIN users u ON u.id=r.signed_by WHERE r.signed_sha256=$1 LIMIT 1`, [hash])).rows[0];
    if (r) return { found: true, source: "request", signer: r.signer || "", signed_at: r.signed_at, name: r.signed_file_name, kinds: ["توقيع/ختم"], sha256: r.signed_sha256, intact: true };
  }
  return { found: false };
}
