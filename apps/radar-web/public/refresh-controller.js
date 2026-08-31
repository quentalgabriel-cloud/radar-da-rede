export const DEFAULT_REFRESH_INTERVAL_MS = 90_000;

export function createRadarRefreshController({
  read,
  apply,
  onStatus = () => {},
  isVisible = () => true,
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  now = () => new Date()
}) {
  let inFlight = null;
  let timer = null;
  let lastReadAt = null;

  const refresh = (reason = "manual") => {
    if (inFlight) return inFlight;
    if (reason === "automatic" && !isVisible()) return Promise.resolve(null);

    onStatus({ state: "loading", reason, lastReadAt });
    inFlight = Promise.resolve()
      .then(() => read(reason))
      .then((data) => {
        lastReadAt = now();
        apply(data);
        onStatus({ state: "success", reason, lastReadAt, consolidatedAt: data?.generated_at ?? null });
        return data;
      })
      .catch((error) => {
        onStatus({ state: "error", reason, lastReadAt, error });
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const start = () => {
    if (timer !== null) return;
    timer = setIntervalImpl(() => {
      if (isVisible()) refresh("automatic").catch(() => {});
    }, intervalMs);
  };

  const stop = () => {
    if (timer !== null) clearIntervalImpl(timer);
    timer = null;
  };

  const refreshIfStale = () => {
    if (!isVisible()) return Promise.resolve(null);
    if (!lastReadAt || now().getTime() - lastReadAt.getTime() >= intervalMs) {
      return refresh("automatic");
    }
    return Promise.resolve(null);
  };

  return { refresh, start, stop, refreshIfStale, isRefreshing: () => inFlight !== null };
}
