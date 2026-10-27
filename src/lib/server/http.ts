import { NextResponse } from "next/server";

export type ApiSuccess<T> = { data: T; requestId: string };
export type ApiFailure = { error: { code: string; message: string }; requestId: string };

export function createRequestId(provided?: string | null): string {
  return provided?.trim() || crypto.randomUUID();
}

export function jsonOk<T>(data: T, requestId: string, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ data, requestId }, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}

export function jsonError(code: string, message: string, requestId: string, status = 400) {
  return NextResponse.json<ApiFailure>({ error: { code, message }, requestId }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
