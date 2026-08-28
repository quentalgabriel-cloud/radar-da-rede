// GENERATED from packages/contracts/src/index.js — do not edit manually.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const SOURCES = new Set(["fake", "android_notification", "waha"]);
const MESSAGE_TYPES = new Set([
  "text", "image", "video", "audio", "document", "location", "contact", "system", "unknown"
]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isDateTime = (value) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);

const requiredString = (value, key, errors, options = {}) => {
  const current = value[key];
  if (typeof current !== "string" || current.length < (options.min ?? 1)) {
    errors.push({ path: `/${key}`, message: "must be a non-empty string" });
    return;
  }
  if (options.max && current.length > options.max) {
    errors.push({ path: `/${key}`, message: `must contain at most ${options.max} characters` });
  }
};

const optionalString = (value, key, errors, max) => {
  if (value[key] === undefined) return;
  if (typeof value[key] !== "string" || value[key].length === 0 || value[key].length > max) {
    errors.push({ path: `/${key}`, message: `must be a non-empty string up to ${max} characters` });
  }
};

const uuid = (value, key, errors) => {
  if (typeof value[key] !== "string" || !UUID_PATTERN.test(value[key])) {
    errors.push({ path: `/${key}`, message: "must be a UUID" });
  }
};

const dateTime = (value, key, errors, optional = false) => {
  const current = value[key];
  if (optional && (current === undefined || current === null)) return;
  if (!isDateTime(current)) errors.push({ path: `/${key}`, message: "must be an ISO-8601 date-time with timezone" });
};

const rejectUnknown = (value, allowed, errors) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push({ path: `/${key}`, message: "is not allowed by this contract version" });
  }
};

const finish = (value, errors) =>
  errors.length === 0 ? { valid: true, data: value, errors } : { valid: false, errors };

export const validateNormalizedEvent = (value) => {
  const errors = [];
  if (!isRecord(value)) return { valid: false, errors: [{ path: "", message: "must be an object" }] };

  rejectUnknown(value, new Set([
    "schema_version", "event_id", "network_id", "device_id", "source", "source_event_id",
    "conversation_id", "conversation_label", "occurred_at", "captured_at", "message_type", "text",
    "sender_ref", "reply_to_event_id", "parser_version", "metadata"
  ]), errors);

  if (value.schema_version !== "0.1.0") errors.push({ path: "/schema_version", message: "must equal 0.1.0" });
  uuid(value, "event_id", errors);
  uuid(value, "network_id", errors);
  uuid(value, "device_id", errors);
  if (!SOURCES.has(value.source)) errors.push({ path: "/source", message: "must be a supported source" });
  optionalString(value, "source_event_id", errors, 512);
  requiredString(value, "conversation_id", errors, { max: 255 });
  optionalString(value, "conversation_label", errors, 255);
  dateTime(value, "occurred_at", errors);
  dateTime(value, "captured_at", errors);
  if (!MESSAGE_TYPES.has(value.message_type)) errors.push({ path: "/message_type", message: "must be a supported message type" });
  if (value.text !== undefined && value.text !== null && (typeof value.text !== "string" || value.text.length > 10000)) {
    errors.push({ path: "/text", message: "must be null or a string up to 10000 characters" });
  }
  if (value.message_type === "text" && (typeof value.text !== "string" || value.text.length === 0)) {
    errors.push({ path: "/text", message: "is required for text messages" });
  }
  optionalString(value, "sender_ref", errors, 255);
  if (value.reply_to_event_id !== undefined && !UUID_PATTERN.test(value.reply_to_event_id)) {
    errors.push({ path: "/reply_to_event_id", message: "must be a UUID" });
  }
  if (typeof value.parser_version !== "string" || !SEMVER_PATTERN.test(value.parser_version)) {
    errors.push({ path: "/parser_version", message: "must be semantic version text" });
  }
  if (!isRecord(value.metadata) || Object.keys(value.metadata).length > 50) {
    errors.push({ path: "/metadata", message: "must be an object with at most 50 properties" });
  }

  return finish(value, errors);
};

export const validateIngestBatch = (value) => {
  const errors = [];
  if (!isRecord(value)) return { valid: false, errors: [{ path: "", message: "must be an object" }] };

  rejectUnknown(value, new Set(["schema_version", "batch_id", "network_id", "device_id", "sent_at", "events"]), errors);
  if (value.schema_version !== "0.1.0") errors.push({ path: "/schema_version", message: "must equal 0.1.0" });
  uuid(value, "batch_id", errors);
  uuid(value, "network_id", errors);
  uuid(value, "device_id", errors);
  dateTime(value, "sent_at", errors);
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 500) {
    errors.push({ path: "/events", message: "must contain between 1 and 500 events" });
  } else {
    value.events.forEach((event, index) => {
      const eventResult = validateNormalizedEvent(event);
      eventResult.errors.forEach((error) => errors.push({ path: `/events/${index}${error.path}`, message: error.message }));
      if (isRecord(event) && event.network_id !== value.network_id) {
        errors.push({ path: `/events/${index}/network_id`, message: "must match batch network_id" });
      }
      if (isRecord(event) && event.device_id !== value.device_id) {
        errors.push({ path: `/events/${index}/device_id`, message: "must match batch device_id" });
      }
    });
  }
  return finish(value, errors);
};

export const validateHealthHeartbeat = (value) => {
  const errors = [];
  if (!isRecord(value)) return { valid: false, errors: [{ path: "", message: "must be an object" }] };

  rejectUnknown(value, new Set([
    "schema_version", "heartbeat_id", "network_id", "device_id", "source", "observed_at",
    "adapter_version", "parser_version", "status", "outbox_pending", "oldest_pending_at",
    "last_event_captured_at", "last_upload_succeeded_at", "counters"
  ]), errors);
  if (value.schema_version !== "0.1.0") errors.push({ path: "/schema_version", message: "must equal 0.1.0" });
  uuid(value, "heartbeat_id", errors);
  uuid(value, "network_id", errors);
  uuid(value, "device_id", errors);
  if (!SOURCES.has(value.source)) errors.push({ path: "/source", message: "must be a supported source" });
  dateTime(value, "observed_at", errors);
  requiredString(value, "adapter_version", errors, { max: 64 });
  optionalString(value, "parser_version", errors, 64);
  if (!new Set(["healthy", "degraded", "offline_recovery"]).has(value.status)) {
    errors.push({ path: "/status", message: "must be a supported health state" });
  }
  if (!Number.isInteger(value.outbox_pending) || value.outbox_pending < 0) {
    errors.push({ path: "/outbox_pending", message: "must be a non-negative integer" });
  }
  dateTime(value, "oldest_pending_at", errors, true);
  dateTime(value, "last_event_captured_at", errors, true);
  dateTime(value, "last_upload_succeeded_at", errors, true);
  if (value.counters !== undefined) {
    if (!isRecord(value.counters) || Object.keys(value.counters).length > 20 || Object.values(value.counters).some((item) => !Number.isInteger(item) || item < 0)) {
      errors.push({ path: "/counters", message: "must contain at most 20 non-negative integer counters" });
    }
  }
  return finish(value, errors);
};
