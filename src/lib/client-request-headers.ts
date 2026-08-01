export function mutationHeaders() {
  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    "Content-Type": "application/json",
    "x-idempotency-key": key,
  };
}
