import { NextResponse } from "next/server";
import { env } from "./env";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function success<T>(data: T, status = 200) {
  return NextResponse.json(
    { success: true, data },
    { status, headers: NO_STORE_HEADERS },
  );
}

export function failure(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    success: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };

  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function validationFailure(message: string, details?: unknown) {
  return failure("VALIDATION_ERROR", message, 400, details);
}

export async function readJson(
  request: Request,
): Promise<{ data?: unknown; error?: ReturnType<typeof failure> }> {
  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return {
      error: failure(
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json.",
        415,
      ),
    };
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > env.maxJsonBodyBytes
  ) {
    return {
      error: failure(
        "PAYLOAD_TOO_LARGE",
        "Request body is too large.",
        413,
      ),
    };
  }

  try {
    const text = await request.text();
    if (!text.trim()) {
      return {
        error: failure("INVALID_JSON", "Request body must contain JSON."),
      };
    }
    if (Buffer.byteLength(text, "utf8") > env.maxJsonBodyBytes) {
      return {
        error: failure(
          "PAYLOAD_TOO_LARGE",
          "Request body is too large.",
          413,
        ),
      };
    }
    return { data: JSON.parse(text) as unknown };
  } catch {
    return {
      error: failure("INVALID_JSON", "Request body must be valid JSON."),
    };
  }
}
