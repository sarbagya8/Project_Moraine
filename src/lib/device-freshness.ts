export type DeviceFreshnessState =
  | "online"
  | "stale"
  | "offline"
  | "never_connected";

export type DeviceFreshnessThresholds = {
  onlineSeconds: number;
  offlineSeconds: number;
};

export function deviceFreshnessState(
  lastSeenAt: string | null | undefined,
  isActive: boolean,
  thresholds: DeviceFreshnessThresholds,
  now = Date.now(),
): DeviceFreshnessState {
  if (!lastSeenAt) return "never_connected";
  if (!isActive) return "offline";
  const captured = Date.parse(lastSeenAt);
  if (!Number.isFinite(captured)) return "offline";
  const ageSeconds = Math.max(0, (now - captured) / 1_000);
  if (ageSeconds <= thresholds.onlineSeconds) return "online";
  if (ageSeconds <= thresholds.offlineSeconds) return "stale";
  return "offline";
}
