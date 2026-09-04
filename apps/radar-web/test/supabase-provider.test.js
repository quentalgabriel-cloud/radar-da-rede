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

test("Supabase provider sends administrative mutations with the user token", async () => {
  const requests = [];
  const provider = createSupabaseProvider({
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.includes("grant_type=password")) return Response.json({ access_token: "user-jwt", refresh_token: "refresh-token" });
      return Response.json({});
    },
    storage: createStorage()
  });
  await provider.signIn("operator@example.com", "correct-horse-battery-staple");
  await provider.classifyGroup("group-id", { classification_status: "confirmed" });
  await provider.reviewGroupAlias("alias-id", "rejected");
  assert.match(requests[1].url, /\/rest\/v1\/rpc\/classify_group$/);
  assert.equal(requests[1].options.headers.authorization, "Bearer user-jwt");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    p_group_id: "group-id", p_changes: { classification_status: "confirmed" }
  });
  assert.match(requests[2].url, /\/rest\/v1\/rpc\/review_group_alias$/);
});

// A consolidação deliberada substituiu o processamento escondido no GET. Se ela
// não for chamada com o token do usuário e por POST, a operação fica sem forma
// de forçar uma janela entre os slots agendados.
const providerComSessao = async (fetchImpl) => {
  const provider = createSupabaseProvider({
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    fetchImpl,
    storage: createStorage()
  });
  await provider.signIn("operator@example.com", "correct-horse-battery-staple");
  return provider;
};

const respostaDeLogin = () => Response.json({
  access_token: "user-jwt", refresh_token: "refresh-token", expires_in: 3600
});

test("a consolidação manual vai por POST autenticado para process-latest-window", async () => {
  const requests = [];
  const provider = await providerComSessao(async (url, options) => {
    requests.push({ url, options });
    if (url.includes("grant_type=password")) return respostaDeLogin();
    return Response.json({ status: "processed", processed: true });
  });
  const result = await provider.refreshLatestWindow("11111111-1111-4111-8111-111111111111");
  assert.equal(result.ok, true);
  assert.equal(result.processed, true);
  const chamada = requests.at(-1);
  assert.match(chamada.url, /\/functions\/v1\/process-latest-window\?network_id=/);
  assert.equal(chamada.options.method, "POST");
  assert.equal(chamada.options.headers.authorization, "Bearer user-jwt");
});

test("viewer sem papel recebe recusa tratada, não exceção", async () => {
  const provider = await providerComSessao(async (url) => {
    if (url.includes("grant_type=password")) return respostaDeLogin();
    return Response.json({ error: "manual_refresh_not_authorized" }, { status: 403 });
  });
  const result = await provider.refreshLatestWindow("11111111-1111-4111-8111-111111111111");
  assert.deepEqual(result, { ok: false, status: "not_authorized" });
});

test("o limite de frequência devolve quanto falta esperar", async () => {
  const provider = await providerComSessao(async (url) => {
    if (url.includes("grant_type=password")) return respostaDeLogin();
    return Response.json({ status: "rate_limited", retry_after_seconds: 210 }, { status: 429 });
  });
  const result = await provider.refreshLatestWindow("11111111-1111-4111-8111-111111111111");
  assert.equal(result.ok, false);
  assert.equal(result.status, "rate_limited");
  assert.equal(result.retry_after_seconds, 210);
});

test("uma falha real continua sendo exceção, não silêncio", async () => {
  const provider = await providerComSessao(async (url) => {
    if (url.includes("grant_type=password")) return respostaDeLogin();
    return Response.json({ error: "analysis_persist_failed" }, { status: 500 });
  });
  await assert.rejects(
    () => provider.refreshLatestWindow("11111111-1111-4111-8111-111111111111"),
    /analysis_persist_failed/
  );
});
