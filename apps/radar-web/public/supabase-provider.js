const SESSION_PREFIX = "radar.supabase.session";

export const createSupabaseProvider = ({ url, publishableKey, fetchImpl = fetch, storage = sessionStorage }) => {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url ?? "")) throw new Error("invalid_supabase_url");
  if (typeof publishableKey !== "string" || !publishableKey.startsWith("sb_publishable_")) {
    throw new Error("invalid_publishable_key");
  }
  const sessionKey = `${SESSION_PREFIX}.${new URL(url).hostname}`;
  let session = null;

  const request = async (path, { method = "GET", body, accessToken } = {}) => {
    const response = await fetchImpl(`${url}${path}`, {
      method,
      headers: {
        apikey: publishableKey,
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(body ? { "content-type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message ?? payload.error_description ?? payload.error ?? `request_failed_${response.status}`);
      error.status = response.status;
      // O corpo carrega detalhe acionável, como retry_after_seconds de uma recusa
      // por limite de frequência. Nunca inclui token: o payload é da resposta.
      error.body = payload;
      throw error;
    }
    return payload;
  };

  const save = (value) => {
    session = value?.access_token ? {
      ...value,
      expires_at: value.expires_at ?? Math.floor(Date.now() / 1000) + Number(value.expires_in ?? 3600)
    } : null;
    if (session) storage.setItem(sessionKey, JSON.stringify(session));
    else storage.removeItem(sessionKey);
    return session;
  };

  const refresh = async () => {
    if (!session?.refresh_token) return save(null);
    try {
      return save(await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token }
      }));
    } catch {
      return save(null);
    }
  };

  const restoreSession = async () => {
    try {
      session = JSON.parse(storage.getItem(sessionKey) ?? "null");
    } catch {
      session = null;
    }
    if (!session?.access_token) return save(null);
    if (Number(session.expires_at ?? 0) <= Math.floor(Date.now() / 1000) + 30) return refresh();
    return session;
  };

  const captureRedirectSession = (href) => {
    const authUrl = new URL(href);
    const params = new URLSearchParams(authUrl.hash.startsWith("#") ? authUrl.hash.slice(1) : "");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;
    const expiresAt = Number(params.get("expires_at"));
    const expiresIn = Number(params.get("expires_in") ?? 3600);
    return save({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: params.get("token_type") ?? "bearer",
      expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
      ...(Number.isFinite(expiresAt) && expiresAt > 0 ? { expires_at: expiresAt } : {})
    });
  };

  const readModel = async (networkId, retry = true) => {
    if (!session?.access_token) throw new Error("authentication_required");
    try {
      return await request(`/functions/v1/radar-read-model?network_id=${encodeURIComponent(networkId)}`, {
        accessToken: session.access_token
      });
    } catch (error) {
      if (retry && error.status === 401 && await refresh()) return readModel(networkId, false);
      throw error;
    }
  };

  // Consolidação deliberada. O GET do read model deixou de processar na P1.1, e
  // esta é a operação que devolve à operação a capacidade de forçar uma janela:
  // restrita a operator/owner pela própria função, idempotente e com intervalo
  // mínimo. Devolve o motivo em vez de lançar quando é recusa esperada.
  const refreshLatestWindow = async (networkId, retry = true) => {
    if (!session?.access_token) throw new Error("authentication_required");
    try {
      const result = await request(
        `/functions/v1/process-latest-window?network_id=${encodeURIComponent(networkId)}`,
        { method: "POST", accessToken: session.access_token }
      );
      return { ...result, ok: true };
    } catch (error) {
      if (retry && error.status === 401 && await refresh()) return refreshLatestWindow(networkId, false);
      if (error.status === 403) return { ok: false, status: "not_authorized" };
      if (error.status === 429) {
        return { ok: false, status: "rate_limited", retry_after_seconds: error.body?.retry_after_seconds ?? null };
      }
      throw error;
    }
  };

  const authenticatedRpc = async (name, body) => {
    if (!session?.access_token) throw new Error("authentication_required");
    return request(`/rest/v1/rpc/${name}`, { method: "POST", body, accessToken: session.access_token });
  };

  return {
    restoreSession,
    captureRedirectSession,
    currentSession: () => session,
    signIn: async (email, password) => save(await request("/auth/v1/token?grant_type=password", {
      method: "POST", body: { email, password }
    })),
    signUp: async (email, password, { redirectTo } = {}) => {
      const path = redirectTo
        ? `/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`
        : "/auth/v1/signup";
      const result = await request(path, { method: "POST", body: { email, password } });
      if (result.access_token) save(result);
      return result;
    },
    signOut: async () => {
      const accessToken = session?.access_token;
      save(null);
      if (accessToken) await request("/auth/v1/logout", { method: "POST", accessToken }).catch(() => {});
    },
    readModel,
    refreshLatestWindow,
    classifyGroup: (groupId, changes) => authenticatedRpc("classify_group", {
      p_group_id: groupId, p_changes: changes
    }),
    reviewGroupAlias: (aliasId, resolutionStatus, groupId = null) => authenticatedRpc("review_group_alias", {
      p_alias_id: aliasId, p_resolution_status: resolutionStatus, p_group_id: groupId
    })
  };
};
