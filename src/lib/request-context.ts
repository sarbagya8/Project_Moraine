import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { failure } from "./api-response";

export type RequestContext = {
  endpoint: string;
  requestId: string;
  startedAt: number;
  method: string;
};

type RouteHandler<TContext> = (
  request: NextRequest,
  routeContext: TContext,
  context: RequestContext,
) => Promise<Response> | Response;

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/;

function getRequestId(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

function log(
  level: "info" | "warn" | "error",
  context: RequestContext,
  event: string,
  details: Record<string, unknown> = {},
) {
  const payload = {
    level,
    event,
    requestId: context.requestId,
    endpoint: context.endpoint,
    method: context.method,
    elapsedMs: Date.now() - context.startedAt,
    ...details,
  };

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export function logInfo(
  context: RequestContext,
  event: string,
  details?: Record<string, unknown>,
) {
  log("info", context, event, details);
}

export function logWarning(
  context: RequestContext,
  event: string,
  details?: Record<string, unknown>,
) {
  log("warn", context, event, details);
}

export function logError(
  context: RequestContext,
  event: string,
  details?: Record<string, unknown>,
) {
  log("error", context, event, details);
}

type StaticRouteContext = { params: Promise<object> };

export function withRequestContext<TContext = StaticRouteContext>(
  endpoint: string,
  handler: RouteHandler<TContext>,
) {
  return async (request: NextRequest, routeContext: TContext) => {
    const context: RequestContext = {
      endpoint,
      requestId: getRequestId(request),
      startedAt: Date.now(),
      method: request.method,
    };

    try {
      const response = await handler(request, routeContext, context);
      response.headers.set("x-request-id", context.requestId);
      logInfo(context, "request.completed", { status: response.status });
      return response;
    } catch (error) {
      logError(context, "request.unhandled_error", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      const response = failure(
        "INTERNAL_ERROR",
        "The request could not be completed.",
        500,
      );
      response.headers.set("x-request-id", context.requestId);
      return response;
    }
  };
}
