const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,100}$/;

export function suppliedIdempotencyKey(request: Request) {
  const supplied = request.headers.get("x-idempotency-key")?.trim();
  return supplied && SAFE_IDEMPOTENCY_KEY.test(supplied) ? supplied : null;
}

export function idempotencyKey(request: Request, fallback: string) {
  return suppliedIdempotencyKey(request) ?? fallback;
}

export function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505",
  );
}
