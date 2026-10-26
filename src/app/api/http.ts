import { connection } from "next/server";

import { MetaRateLimitError, MetaUnauthorizedError } from "@/lib/meta/client";

export async function bindRequest(): Promise<void> {
  await connection();
}

export function metaErrorResponse(error: unknown): Response | null {
  if (error instanceof MetaUnauthorizedError) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (error instanceof MetaRateLimitError) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  return null;
}

export function failureResponse(error: unknown, label: string): Response {
  const mapped = metaErrorResponse(error);
  if (mapped) return mapped;
  console.error(label, error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "request_failed" }, { status: 500 });
}

export async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    return value as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function stringField(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
