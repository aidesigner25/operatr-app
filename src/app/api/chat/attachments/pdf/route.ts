import { createRequestId, jsonError, jsonOk } from "@/lib/server/http";
import { getAuthenticatedRequest } from "@/lib/server/supabase";
import { allowRequest } from "@/lib/server/rate-limit";
import { extractPdfText, PdfExtractionError } from "@/lib/server/pdf-extract";
import { ATTACHMENT_BYTE_LIMIT, ATTACHMENT_CHAR_LIMIT, PDF_BYTE_LIMIT, PDF_PAGE_LIMIT, attachmentSecurityIssue } from "@/lib/shared/chat-attachment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const id = createRequestId(request.headers.get("x-request-id"));
  try {
    const auth = await getAuthenticatedRequest();
    if (!auth) return jsonError("unauthorized", "Sign in is required.", id, 401);
    let origin: string;
    try { origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin; } catch { return jsonError("invalid_origin", "The request origin is invalid.", id, 403); }
    if (request.headers.get("origin") !== origin) return jsonError("invalid_origin", "The request origin is invalid.", id, 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") return jsonError("invalid_pdf", "Choose a PDF file.", id, 415);
    if (!allowRequest(`pdf:extract:${auth.user.id}`, 10, 60_000)) return jsonError("rate_limited", "Too many PDF uploads. Try again shortly.", id, 429);
    const declared = request.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > PDF_BYTE_LIMIT)) return jsonError("pdf_too_large", "Choose a PDF no larger than 2 MB.", id, 413);
    const reader = request.body?.getReader();
    if (!reader) return jsonError("invalid_pdf", "Choose a nonempty PDF.", id, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PDF_BYTE_LIMIT) { void reader.cancel(); return jsonError("pdf_too_large", "Choose a PDF no larger than 2 MB.", id, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return jsonError("invalid_pdf", "The file is not a valid PDF.", id, 400);
    const text = await extractPdfText(bytes, { maxPages: PDF_PAGE_LIMIT, maxChars: ATTACHMENT_CHAR_LIMIT });
    if (new TextEncoder().encode(text).length > ATTACHMENT_BYTE_LIMIT) return jsonError("pdf_text_too_large", "The PDF's extracted text exceeds 64 KB. Try a shorter document.", id, 400);
    if (attachmentSecurityIssue(text)) return jsonError("unsafe_attachment", "This file contains instructions that attempt to control the assistant or expose secrets. Remove that content and try again.", id, 400);
    return jsonOk({ text }, id);
  } catch (error) {
    const code = error instanceof PdfExtractionError ? error.message : "invalid_pdf";
    const messages: Record<string, string> = { page_limit: "Choose a PDF with at most 25 pages.", active_content: "PDFs with embedded files or JavaScript are not supported.", text_limit: "The PDF contains more than 20,000 characters of text. Try a shorter document.", empty_text: "No selectable text was found. Scanned image PDFs require OCR, which is not supported yet.", timeout: "PDF extraction took too long. Try a smaller document.", invalid_pdf: "The PDF is invalid, encrypted, or could not be read." };
    return jsonError("pdf_unavailable", messages[code] || messages.invalid_pdf, id, 400);
  }
}
