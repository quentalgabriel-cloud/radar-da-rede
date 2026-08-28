import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseProvider } from "../public/supabase-provider.js";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    size: () => values.size
  };
};

test("Supabase provider keeps privileged keys out and scopes the read model to the user session", async () => {
  const requests = [];
  const storage = createStorage();
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes("grant_type=password")) {
      return Response.json({ access_token: "user-jwt", refresh_token: "refresh-token", expires_in: 3600 });
    }
    if (url.includes("radar-read-model")) return Response.json({ schema_version: "0.1.0" });
    return Response.json({});
  };
  const provider = createSupabaseProvider({
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    fetchImpl,
    storage
  });

  await provider.signIn("operator@example.com", "correct-horse-battery-staple");
  const model = await provider.readModel("11111111-1111-4111-8111-111111111111");
  assert.equal(model.schema_version, "0.1.0");
  assert.equal(requests[1].options.headers.apikey, "sb_publishable_test");
  assert.equal(requests[1].options.headers.authorization, "Bearer user-jwt");
  assert.equal(storage.size(), 1);

  await provider.signOut();
  assert.equal(storage.size(), 0);
});

test("Supabase provider rejects invalid public configuration", () => {
  assert.throws(() => createSupabaseProvider({
    url: "http://example.test",
    publishableKey: "secret-key",
    fetchImpl: async () => Response.json({}),
    storage: createStorage()
  }), /invalid_supabase_url/);
});

test("Supabase provider sends the signup redirect URL to Auth", async () => {
  const requests = [];
  const provider = createSupabaseProvider({
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return Response.json({ id: "new-user-id" });
    },
    storage: createStorage()
  });

  await provider.signUp("operator@example.com", "correct-horse-battery-staple", {
    redirectTo: "https://radar-da-rede.vercel.app/?mode=live"
  });

  const signupUrl = new URL(requests[0].url);
  assert.equal(signupUrl.pathname, "/auth/v1/signup");
  assert.equal(signupUrl.searchParams.get("redirect_to"), "https://radar-da-rede.vercel.app/?mode=live");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    email: "operator@example.com",
    password: "correct-horse-battery-staple"
  });
});

test("Supabase provider captures an implicit auth redirect session", () => {
  const storage = createStorage();
  const provider = createSupabaseProvider({
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    fetchImpl: async () => Response.json({}),
    storage
  });

  const session = provider.captureRedirectSession(
    "https://radar-da-rede.vercel.app/?mode=live#access_token=user-jwt&refresh_token=refresh-token&expires_in=3600&token_type=bearer&type=signup"
  );

  assert.equal(session.access_token, "user-jwt");
  assert.equal(session.refresh_token, "refresh-token");
  assert.equal(storage.size(), 1);
});
