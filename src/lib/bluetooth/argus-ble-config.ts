export const ARGUS_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const ARGUS_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

export const ARGUS_BLE = Object.freeze({
  service: ARGUS_SERVICE_UUID,
  characteristic: ARGUS_CHARACTERISTIC_UUID,
});

export const ARGUS_SENSOR_STATES = [
  "valid",
  "no_finger",
  "weak_signal",
  "invalid",
  "sensor_unavailable",
  "sensor_error",
] as const;

export type ArgusSensorState = (typeof ARGUS_SENSOR_STATES)[number];

export const ARGUS_READING_PERSIST_INTERVAL_MS = 15_000;
export const ARGUS_SENSOR_STALE_MS = 15_000;
