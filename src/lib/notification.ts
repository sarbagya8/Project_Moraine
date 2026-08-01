export type NotificationStatus =
  | "pending"
  | "simulated"
  | "not_configured"
  | "accepted"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type NotificationResult = {
  success: boolean;
  status: Exclude<NotificationStatus, "pending">;
  provider: "whatsapp" | "demo";
  providerMessageId?: string;
  providerSummary?: Record<string, unknown>;
  error?: string;
};

export type TrustedContacts = {
  emergency_contact: string | null;
  guide_mobile: string | null;
};

export function aggregateNotificationStatus(results: NotificationResult[]) {
  return aggregateStoredNotificationStatus(
    results.map((result) => result.status),
  );
}

export function aggregateStoredNotificationStatus(
  statuses: NotificationStatus[],
) {
  const priority: NotificationStatus[] = [
    "read",
    "delivered",
    "sent",
    "accepted",
    "queued",
    "simulated",
  ];
  return (
    priority.find((status) => statuses.includes(status)) ??
    (statuses.includes("failed")
      ? "failed"
      : "not_configured")
  );
}

export function cooldownRemainingSeconds(
  latestAttemptAt: string | null,
  cooldownSeconds: number,
  now = Date.now(),
) {
  if (!latestAttemptAt) return 0;
  const elapsed = now - Date.parse(latestAttemptAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return cooldownSeconds;
  return Math.max(0, Math.ceil(cooldownSeconds - elapsed / 1_000));
}
