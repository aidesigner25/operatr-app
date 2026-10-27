import { createRequestId, jsonOk } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-sensitive endpoint for local and preview verification. */
export async function GET(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  return jsonOk({ status: "ok", service: "operatr", stage: "foundation" }, requestId);
}
