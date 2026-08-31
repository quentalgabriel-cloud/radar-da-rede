import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

export type ProcessingPrincipal = { networkId: string };

export async function authenticateProcessor(
  authorization: string | null,
  admin: SupabaseClient,
): Promise<ProcessingPrincipal | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const secret = authorization.slice("Bearer ".length);
  if (secret.length < 32 || secret.length > 512) return null;

  const tokenHash = await sha256(secret);
  const { data, error } = await admin
    .from("processing_credentials")
    .select("network_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return { networkId: data.network_id };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

