import "server-only";
import { randomBytes } from "node:crypto";
import { googleConfig, loadGoogleRefreshToken } from "@/lib/server/google-workspace";
import { markdownBlocks, docHtml, sheetLayout } from "@/lib/server/google-format";

export type ExportKind = "doc" | "sheet";
export class GoogleExportError extends Error {
  constructor(message: string, readonly status = 502, readonly partialUrl?: string) { super(message); }
}

async function getAccessToken(userId: string, accessToken: string) {
  const config = googleConfig();
  if (!config) throw new GoogleExportError("Google Workspace is not configured.", 503);
  const token = await loadGoogleRefreshToken(userId, accessToken);
  if (!token) throw new GoogleExportError("Connect Google Workspace in Integrations first.", 409);
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: token, grant_type: "refresh_token" }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => null) as { access_token?: unknown; error?: unknown } | null;
  if (!response.ok || typeof payload?.access_token !== "string") {
    if (payload?.error === "invalid_grant") throw new GoogleExportError("Your Google authorization expired or was revoked. Disconnect and reconnect Google Workspace in Integrations.", 409);
    throw new GoogleExportError("Google authorization could not be refreshed. Please try again.");
  }
  return payload.access_token;
}

function validId(id: unknown): id is string { return typeof id === "string" && /^[a-zA-Z0-9_-]{10,200}$/.test(id); }
function requestHeaders(token: string) { return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }; }

export async function exportGoogleResponse(input: { kind: ExportKind; title: string; content: string; userId: string; accessToken: string }) {
  if (!input.content.trim() || input.content.length > 50_000) throw new GoogleExportError("The response is empty or exceeds the export limit.", 400);
  const title = input.title.trim().slice(0, 160) || "Operatr response";
  const blocks = markdownBlocks(input.content);
  let layout: ReturnType<typeof sheetLayout> | null = null;
  if (input.kind === "sheet") {
    try { layout = sheetLayout(blocks); } catch (error) { throw new GoogleExportError(error instanceof Error ? error.message : "The response cannot be exported.", 400); }
  }
  const token = await getAccessToken(input.userId, input.accessToken);
  const headers = requestHeaders(token);
  if (input.kind === "sheet" && layout) {
    let created: Response;
    try { created = await fetch("https://sheets.googleapis.com/v4/spreadsheets", { method: "POST", headers, body: JSON.stringify({ properties: { title }, sheets: [{ properties: { sheetId: 0, title: "Response", gridProperties: { rowCount: Math.max(1000, layout.rowData.length), columnCount: Math.max(26, layout.width), hideGridlines: true } }, merges: layout.merges, data: [{ startRow: 0, startColumn: 0, rowData: layout.rowData, rowMetadata: layout.rowMetadata, columnMetadata: layout.columnMetadata }] }] }), cache: "no-store", signal: AbortSignal.timeout(25_000) }); }
    catch { throw new GoogleExportError("Google did not confirm whether the spreadsheet was created. Check Drive before retrying."); }
    const result = await created.json().catch(() => null) as { spreadsheetId?: unknown } | null;
    if (!created.ok || !validId(result?.spreadsheetId)) throw new GoogleExportError("Google did not confirm whether the spreadsheet was created. Check Drive before retrying.");
    return { url: `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`, partial: false };
  }
  const boundary = `operatr_${randomBytes(18).toString("hex")}`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" })}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${docHtml(blocks)}\r\n--${boundary}--\r\n`;
  let created: Response;
  try {
    created = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  } catch { throw new GoogleExportError("Google did not confirm whether the document was created. Check Drive before retrying."); }
  const result = await created.json().catch(() => null) as { id?: unknown; mimeType?: unknown } | null;
  if (!created.ok || !validId(result?.id) || result?.mimeType !== "application/vnd.google-apps.document") throw new GoogleExportError("Google did not confirm whether the document was created. Check Drive before retrying.");
  return { url: `https://docs.google.com/document/d/${result.id}/edit`, partial: false };
}
