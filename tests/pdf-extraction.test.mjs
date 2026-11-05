import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPdfText } from "../src/lib/server/pdf-extract.ts";
function makePdf(text, pages = 1, script = false) {
  const streams = Array.from({ length: pages }, (_, i) => `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`);
  const objects = [script ? "<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert) >> >>" : "<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${streams.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let i = 0; i < pages; i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${streams[i].length} >>\nstream\n${streams[i]}\nendstream`);
  let body = "%PDF-1.4\n"; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(body); body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body));
}
test("extracts selectable text from a real PDF in an isolated worker", async () => {
  assert.match(await extractPdfText(makePdf("Hello from a PDF"), { maxPages: 25, maxChars: 20000 }), /Hello from a PDF/);
});
test("rejects oversized page count, no text, and malformed documents", async () => {
  await assert.rejects(extractPdfText(makePdf("Hello", 1, true), { maxPages: 25, maxChars: 20000 }), /active_content/);
  await assert.rejects(extractPdfText(makePdf("Hello", 2), { maxPages: 1, maxChars: 20000 }), /page_limit/);
  await assert.rejects(extractPdfText(makePdf(" "), { maxPages: 25, maxChars: 20000 }), /empty_text/);
  await assert.rejects(extractPdfText(new TextEncoder().encode("not a pdf"), { maxPages: 25, maxChars: 20000 }), /invalid_pdf/);
});
