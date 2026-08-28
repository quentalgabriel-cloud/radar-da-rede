import { createHash, timingSafeEqual } from "node:crypto";
import { validateHealthHeartbeat, validateIngestBatch } from "@radar-rede/contracts";

const digest = (value) => createHash("sha256").update(value, "utf8").digest();

export const createStaticDeviceAuthenticator = ({ deviceId, networkId, secret }) => {
  if (!deviceId || !networkId || !secret) throw new Error("device authenticator requires deviceId, networkId and secret");
  const expected = digest(secret);
  return async (authorization) => {
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
    const candidate = digest(authorization.slice("Bearer ".length));
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null;
    return { device_id: deviceId, network_id: networkId };
  };
};

export class InMemoryRadarRepository {
  #batches = new Map();
  #events = new Map();
  #health = new Map();

  async ingestBatch(batch) {
    if (this.#batches.has(batch.batch_id)) {
      return { duplicate_batch: true, accepted_events: 0, duplicate_events: batch.events.length };
    }

    let acceptedEvents = 0;
    let duplicateEvents = 0;
    for (const event of batch.events) {
      if (this.#events.has(event.event_id)) duplicateEvents += 1;
      else {
        this.#events.set(event.event_id, structuredClone(event));
        acceptedEvents += 1;
      }
    }
    this.#batches.set(batch.batch_id, {
      batch_id: batch.batch_id,
      network_id: batch.network_id,
      device_id: batch.device_id,
      sent_at: batch.sent_at,
      accepted_events: acceptedEvents,
      duplicate_events: duplicateEvents
    });
    return { duplicate_batch: false, accepted_events: acceptedEvents, duplicate_events: duplicateEvents };
  }

  async upsertHeartbeat(heartbeat) {
    const current = this.#health.get(heartbeat.device_id);
    if (!current || Date.parse(heartbeat.observed_at) >= Date.parse(current.observed_at)) {
      this.#health.set(heartbeat.device_id, structuredClone(heartbeat));
      return { updated: true };
    }
    return { updated: false, stale: true };
  }

  snapshot() {
    return {
      batches: [...this.#batches.values()].map((item) => structuredClone(item)),
      events: [...this.#events.values()].map((item) => structuredClone(item)),
      health: [...this.#health.values()].map((item) => structuredClone(item))
    };
  }
}

const failure = (status, code, errors = []) => ({ ok: false, status, body: { error: code, details: errors } });

export const createIngestService = ({ repository, authenticateDevice }) => {
  if (!repository || !authenticateDevice) throw new Error("repository and authenticateDevice are required");

  const authorize = async (authorization, networkId, deviceId) => {
    const principal = await authenticateDevice(authorization);
    if (!principal) return failure(401, "invalid_device_credentials");
    if (principal.device_id !== deviceId || principal.network_id !== networkId) {
      return failure(403, "device_scope_mismatch");
    }
    return null;
  };

  return {
    async ingestEvents({ authorization, body }) {
      const validation = validateIngestBatch(body);
      if (!validation.valid) return failure(400, "invalid_ingest_batch", validation.errors);
      const denied = await authorize(authorization, body.network_id, body.device_id);
      if (denied) return denied;
      const result = await repository.ingestBatch(body);
      return { ok: true, status: result.duplicate_batch ? 200 : 202, body: result };
    },

    async ingestHealth({ authorization, body }) {
      const validation = validateHealthHeartbeat(body);
      if (!validation.valid) return failure(400, "invalid_health_heartbeat", validation.errors);
      const denied = await authorize(authorization, body.network_id, body.device_id);
      if (denied) return denied;
      const result = await repository.upsertHeartbeat(body);
      return { ok: true, status: 202, body: result };
    }
  };
};
