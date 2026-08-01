export const ARGUS_BLE = Object.freeze({
  service: "7c9e0001-9b6a-4b4f-9e8a-45d2c480a001",
  deviceInfo: "7c9e0002-9b6a-4b4f-9e8a-45d2c480a001",
  liveSensor: "7c9e0003-9b6a-4b4f-9e8a-45d2c480a001",
  sosEvent: "7c9e0004-9b6a-4b4f-9e8a-45d2c480a001",
});

export const ARGUS_SENSOR_STATES = [
  "initializing",
  "valid",
  "no_finger",
  "weak_signal",
  "invalid_reading",
  "sensor_not_found",
  "sensor_error",
] as const;

export type ArgusSensorState = (typeof ARGUS_SENSOR_STATES)[number];
