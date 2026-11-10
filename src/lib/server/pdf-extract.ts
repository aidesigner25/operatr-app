import { Worker } from "node:worker_threads";

export class PdfExtractionError extends Error {}
// A separate worker bounds CPU time and V8 heap; only the PDF's text crosses
// back to the main process. Embedded actions are never executed.
const workerScript = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  let doc;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(workerData.bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, stopAtErrors: true });
    doc = await task.promise;
    if (doc.numPages > workerData.maxPages) throw new Error('page_limit');
    const [actions, attachments] = await Promise.all([doc.getJSActions(), doc.getAttachments()]);
    if ((actions && Object.keys(actions).length) || (attachments && Object.keys(attachments).length)) throw new Error('active_content');
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const [pageActions, annotations] = await Promise.all([page.getJSActions(), page.getAnnotations({ intent: 'display' })]);
      if ((pageActions && Object.keys(pageActions).length) || annotations.some((annotation) => annotation.subtype === 'FileAttachment')) throw new Error('active_content');
      // Consume text incrementally before applying the application limit.
      const textReader = page.streamTextContent().getReader();
      let textStreamDone = false;
      try {
        while (true) {
          const chunk = await textReader.read();
          if (chunk.done) { textStreamDone = true; break; }
          for (const item of chunk.value.items) {
            if (typeof item.str !== 'string') continue;
            if (text.length + item.str.length + 1 > workerData.maxChars) throw new Error('text_limit');
            text += item.str + (item.hasEOL ? '\\n' : ' ');
          }
        }
      } finally {
        if (!textStreamDone) await textReader.cancel().catch(() => {});
        textReader.releaseLock();
      }
      text += '\\n\\n';
      page.cleanup();
    }
    text = text.replace(/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/g, '').trim();
    if (!text) throw new Error('empty_text');
    parentPort.postMessage({ text });
  } catch (error) {
    const known = ['page_limit', 'active_content', 'text_limit', 'empty_text'];
    parentPort.postMessage({ error: known.includes(error?.message) ? error.message : 'invalid_pdf' });
  } finally { if (doc) await doc.destroy().catch(() => {}); }
})();`;

export function extractPdfText(bytes: Uint8Array, options: { maxPages: number; maxChars: number; timeoutMs?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScript, { eval: true, workerData: { bytes, maxPages: options.maxPages, maxChars: options.maxChars }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 } });
    let settled = false;
    const finish = (error?: string, text?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (error) reject(new PdfExtractionError(error)); else resolve(text || "");
    };
    const timer = setTimeout(() => finish("timeout"), options.timeoutMs ?? 15_000);
    worker.on("message", (result: { text?: string; error?: string }) => finish(result.error, result.text));
    worker.on("error", () => finish("invalid_pdf"));
    worker.on("exit", () => { if (!settled) finish("invalid_pdf"); });
  });
}
