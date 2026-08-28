export const networkId = "d1224e68-c51f-4b31-a7e6-7b91f1a65357";
export const deviceId = "b9717b98-05c9-4bdf-bb3e-95ef50303b34";

export const validEvent = {
  schema_version: "0.1.0",
  event_id: "56a416cf-657a-44a8-9a7c-97072fd062fa",
  network_id: networkId,
  device_id: deviceId,
  source: "fake",
  source_event_id: "normal-day:1",
  conversation_id: "mobilizacao-rio-doce",
  conversation_label: "Mobilização Rio Doce",
  occurred_at: "2026-08-26T12:00:00.000Z",
  captured_at: "2026-08-26T12:00:01.000Z",
  message_type: "text",
  text: "Ainda não chegou o material aqui.",
  sender_ref: "actor-a",
  parser_version: "0.1.0",
  metadata: { scenario: "normal-day" }
};

export const validBatch = {
  schema_version: "0.1.0",
  batch_id: "23558e7d-9276-4c6c-bdd7-2d3d50e9f5cf",
  network_id: networkId,
  device_id: deviceId,
  sent_at: "2026-08-26T12:00:02.000Z",
  events: [validEvent]
};

export const validHeartbeat = {
  schema_version: "0.1.0",
  heartbeat_id: "c0da8b1e-9c41-4f64-a93f-c8ab0f08e7fa",
  network_id: networkId,
  device_id: deviceId,
  source: "fake",
  observed_at: "2026-08-26T12:00:03.000Z",
  adapter_version: "0.1.0",
  parser_version: "0.1.0",
  status: "healthy",
  outbox_pending: 0,
  oldest_pending_at: null,
  last_event_captured_at: "2026-08-26T12:00:01.000Z",
  last_upload_succeeded_at: "2026-08-26T12:00:02.000Z",
  counters: { captured: 1, uploaded: 1 }
};
