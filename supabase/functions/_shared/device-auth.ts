import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

export type DevicePrincipal = {
  deviceId: string;
  networkId: string;
  source: "fake" | "android_notification" | "waha";
};

export async function authenticateDevice(
  authorization: string | null,
  admin: SupabaseClient,
): Promise<DevicePrincipal | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  if (token.length < 32 || token.length > 512) return null;

  const tokenHash = await sha256(token);
  const { data: credential, error: credentialError } = await admin
    .from("device_credentials")
    .select("device_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (credentialError || !credential) return null;

  const { data: device, error: deviceError } = await admin
    .from("source_devices")
    .select("id, network_id, source, status")
    .eq("id", credential.device_id)
    .eq("status", "active")
    .maybeSingle();
  if (deviceError || !device) return null;

  return {
    deviceId: device.id,
    networkId: device.network_id,
    source: device.source,
  } as DevicePrincipal;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
