export const CONSOLIDATION_TIME_ZONE = "America/Recife";
export const CONSOLIDATION_LOCAL_HOURS = Object.freeze([8, 13, 18]);
export const CONSOLIDATION_WINDOW_HOURS = 24;

const zonedParts = (date, timeZone) => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date)
    .filter(({ type }) => type !== "literal")
    .map(({ type, value }) => [type, Number(value)])
);

function localDateTimeToUtc(parts, timeZone) {
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, 0, 0, 0);
  let candidate = wallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const observed = zonedParts(new Date(candidate), timeZone);
    const observedWallClock = Date.UTC(
      observed.year, observed.month - 1, observed.day,
      observed.hour, observed.minute, observed.second
    );
    candidate += wallClock - observedWallClock;
  }
  return new Date(candidate);
}

export function canonicalConsolidationWindow(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("invalid_now");
  const local = zonedParts(now, CONSOLIDATION_TIME_ZONE);
  const eligibleHour = [...CONSOLIDATION_LOCAL_HOURS].reverse().find((hour) => hour <= local.hour);
  let localDate = { year: local.year, month: local.month, day: local.day };
  let hour = eligibleHour;
  if (hour === undefined) {
    const previous = new Date(Date.UTC(local.year, local.month - 1, local.day - 1));
    localDate = {
      year: previous.getUTCFullYear(),
      month: previous.getUTCMonth() + 1,
      day: previous.getUTCDate()
    };
    hour = CONSOLIDATION_LOCAL_HOURS.at(-1);
  }
  const endsAt = localDateTimeToUtc({ ...localDate, hour }, CONSOLIDATION_TIME_ZONE);
  const startsAt = new Date(endsAt.getTime() - CONSOLIDATION_WINDOW_HOURS * 60 * 60 * 1000);
  return { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() };
}
