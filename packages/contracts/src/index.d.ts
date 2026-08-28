export type Source = "fake" | "android_notification" | "waha";

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "location"
  | "contact"
  | "system"
  | "unknown";

export interface NormalizedEvent {
  schema_version: "0.1.0";
  event_id: string;
  network_id: string;
  device_id: string;
  source: Source;
  source_event_id?: string;
  conversation_id: string;
  conversation_label?: string;
  occurred_at: string;
  captured_at: string;
  message_type: MessageType;
  text?: string | null;
  sender_ref?: string;
  reply_to_event_id?: string;
  parser_version: string;
  metadata: Record<string, unknown>;
}

export interface IngestBatch {
  schema_version: "0.1.0";
  batch_id: string;
  network_id: string;
  device_id: string;
  sent_at: string;
  events: NormalizedEvent[];
}

export interface HealthHeartbeat {
  schema_version: "0.1.0";
  heartbeat_id: string;
  network_id: string;
  device_id: string;
  source: Source;
  observed_at: string;
  adapter_version: string;
  parser_version?: string;
  status: "healthy" | "degraded" | "offline_recovery";
  outbox_pending: number;
  oldest_pending_at?: string | null;
  last_event_captured_at?: string | null;
  last_upload_succeeded_at?: string | null;
  counters?: Record<string, number>;
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: ValidationError[];
}

export function validateNormalizedEvent(value: unknown): ValidationResult<NormalizedEvent>;
export function validateIngestBatch(value: unknown): ValidationResult<IngestBatch>;
export function validateHealthHeartbeat(value: unknown): ValidationResult<HealthHeartbeat>;
