// Brazil telemetry has two activation gates: this client build flag and the
// hosted ingest service flag. Keep this false until the staged rollout is
// explicitly approved and the hosted migration/function are verified.
export const BR_TELEMETRY_ROLLOUT_ENABLED = false;
export const BR_TELEMETRY_DEFAULT_MODE = "disabled";
export const BR_TELEMETRY_SCHEMA_VERSION = 1;
export const BR_TELEMETRY_INGEST_FUNCTION = "telemetry-ingest-v1";
export const BR_TELEMETRY_MAX_QUEUE = 100;
export const BR_TELEMETRY_BATCH_SIZE = 20;

