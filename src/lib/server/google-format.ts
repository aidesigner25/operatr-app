import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

type Node = { type: string; value?: string; url?: string; alt?: string; identifier?: string; depth?: number; ordered?: boolean; start?: number; checked?: boolean | null; children?: Node[] };
type Style = { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean; link?: string };
type Fragment = { text: string; style: Style };
type Block = { type: "heading" | "paragraph" | "list" | "code" | "tableHeader" | "tableRow" | "rule"; depth?: number; cells: Fragment[][] };
const parser = unified().use(remarkParse).use(remarkGfm);
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
const plain = (text: string): Fragment[] => [{ text: clean(text), style: {} }];
function safeLink(url: string | undefined) {
  if (!url) return undefined;
  try { const parsed = new URL(url); return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.toString() : undefined; } catch { return undefined; }
}

export function markdownBlocks(markdown: string): Block[] {
  const root = parser.parse(markdown) as unknown as Node;
  const definitions = new Map<string, string>();
  for (const child of root.children || []) if (child.type === "definition" && child.identifier && child.url) definitions.set(child.identifier.toLowerCase(), child.url);
  const inline = (node: Node, style: Style = {}): Fragment[] => {
    const next = { ...style };
    if (node.type === "strong") next.bold = true;
    if (node.type === "emphasis") next.italic = true;
    if (node.type === "delete") next.strikethrough = true;
    if (node.type === "inlineCode") next.code = true;
    if (node.type === "link" || node.type === "linkReference") next.link = safeLink(node.url || (node.identifier && definitions.get(node.identifier.toLowerCase())));
    if (node.type === "break") return [{ text: "\n", style: next }];
    if (node.type === "html" && /^<br\s*\/?>$/i.test((node.value || "").trim())) return [{ text: "\n", style: next }];
    if (node.type === "image" || node.type === "imageReference") return [{ text: clean(node.alt || "Image"), style: { ...next, link: safeLink(node.url || (node.identifier && definitions.get(node.identifier.toLowerCase()))) } }];
    if (node.children) return node.children.flatMap((child) => inline(child, next));
    return node.value ? [{ text: clean(node.value), style: next }] : [];
  };
  const blocks: Block[] = [];
  const visit = (node: Node, level = 0) => {
    if (node.type === "definition") return;
    if (node.type === "heading") { blocks.push({ type: "heading", depth: node.depth, cells: [inline(node)] }); return; }
    if (node.type === "paragraph") { blocks.push({ type: "paragraph", cells: [inline(node)] }); return; }
    if (node.type === "code") { blocks.push({ type: "code", cells: [plain(node.value || "")] }); return; }
    if (node.type === "thematicBreak") { blocks.push({ type: "rule", cells: [plain("────────")] }); return; }
    if (node.type === "table") {
      (node.children || []).forEach((row, index) => blocks.push({ type: index === 0 ? "tableHeader" : "tableRow", cells: (row.children || []).map((cell) => inline(cell)) }));
      return;
    }
    if (node.type === "list") {
      (node.children || []).forEach((item, index) => {
        const marker = node.ordered ? `${(node.start || 1) + index}. ` : "• ";
        const children = item.children || [];
        let first = true;
        for (const child of children) {
          if (child.type === "paragraph") {
            const prefix = first ? `${"  ".repeat(Math.min(level, 5))}${marker}${item.checked === true ? "☑ " : item.checked === false ? "☐ " : ""}` : "  ".repeat(Math.min(level + 1, 6));
            blocks.push({ type: "list", cells: [[...plain(prefix), ...inline(child)]] }); first = false;
          } else visit(child, level + 1);
        }
      });
      return;
    }
    if (node.type === "blockquote") { for (const child of node.children || []) { const before = blocks.length; visit(child, level); if (blocks[before]) blocks[before].cells[0].unshift(...plain("│ ")); } return; }
    if (node.children) { for (const child of node.children) visit(child, level); return; }
    if (node.value) blocks.push({ type: "paragraph", cells: [plain(node.value)] });
  };
  for (const node of root.children || []) visit(node);
  return blocks;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Semantic HTML is imported by Drive as an editable Google Doc. */
export function docHtml(blocks: Block[]) {
  const render = (fragments: Fragment[], preserveNewlines = false) => fragments.map(({ text, style }) => {
    let result = escapeHtml(text);
    if (!preserveNewlines) result = result.replace(/\n/g, "<br>");
    if (style.code) result = `<code>${result}</code>`;
    if (style.strikethrough) result = `<s>${result}</s>`;
    if (style.italic) result = `<em>${result}</em>`;
    if (style.bold) result = `<strong>${result}</strong>`;
    if (style.link) result = `<a href="${escapeHtml(style.link)}">${result}</a>`;
    return result;
  }).join("");
  const content: string[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.type === "tableHeader") {
      const tableBlocks = [block];
      while (blocks[index + 1]?.type === "tableRow") tableBlocks.push(blocks[++index]);
      const width = Math.max(...tableBlocks.map((row) => row.cells.length));
      const rows = tableBlocks.map((row, rowIndex) => {
        const cells = Array.from({ length: width }, (_, column) => {
          const header = rowIndex === 0;
          const tag = header ? "th" : "td";
          const color = header ? "#e9e7df" : rowIndex % 2 === 0 ? "#f7f7f3" : "#ffffff";
          return `<${tag} bgcolor="${color}" style="border:1px solid #d8d5ca;padding:8px;vertical-align:top;text-align:left;">${render(row.cells[column] || []) || "&nbsp;"}</${tag}>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      content.push(`<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0 16px;">${rows}</table>`);
      continue;
    }
    const value = render(block.cells[0] || [], block.type === "code") || "&nbsp;";
    if (block.type === "heading") {
      const depth = Math.max(1, Math.min(block.depth || 1, 6));
      content.push(`<h${depth} style="font-family:Arial,sans-serif;margin:20px 0 8px;line-height:1.25;">${value}</h${depth}>`);
    } else if (block.type === "code") {
      content.push(`<pre style="font-family:monospace;background-color:#f3f2ed;padding:10px;margin:8px 0 14px;white-space:pre-wrap;">${value}</pre>`);
    } else if (block.type === "rule") {
      content.push(`<p style="color:#aaa;margin:14px 0;">${value}</p>`);
    } else {
      const margin = block.type === "list" ? "3px 0 5px 16px" : "0 0 12px";
      content.push(`<p style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.4;margin:${margin};">${value}</p>`);
    }
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.4;color:#262823;">${content.join("\n")}</body></html>`;
}

export function sheetLayout(blocks: Block[]) {
  if (blocks.length > 2000) throw new Error("The response has more than 2,000 sections or rows; shorten it before exporting.");
  if (blocks.some((block) => block.cells.length > 40)) throw new Error("The response has a table with more than 40 columns; shorten it before exporting.");
  const width = Math.max(4, ...blocks.map((block) => block.cells.length));
  const dark = { red: 0.23, green: 0.25, blue: 0.22 };
  const light = { red: 0.94, green: 0.93, blue: 0.90 };
  const soft = { red: 0.97, green: 0.97, blue: 0.95 };
  const border = { style: "SOLID", color: { red: 0.86, green: 0.86, blue: 0.83 } };
  const merges: object[] = [];
  const rowMetadata: object[] = [];
  const rowData = blocks.map((block, rowIndex) => {
    const isTable = block.type === "tableHeader" || block.type === "tableRow";
    if (!isTable) merges.push({ sheetId: 0, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: width });
    const values = block.cells.map((fragments) => {
      let value = "";
      const textFormatRuns: object[] = [];
      const baseBold = block.type === "heading" || block.type === "tableHeader";
      for (const fragment of fragments) {
        if (!fragment.text) continue;
        const format: Record<string, unknown> = { bold: Boolean(baseBold || fragment.style.bold), italic: Boolean(fragment.style.italic), strikethrough: Boolean(fragment.style.strikethrough) };
        if (fragment.style.code || block.type === "code") format.fontFamily = "Courier New";
        if (fragment.style.link) format.link = { uri: fragment.style.link };
        textFormatRuns.push({ startIndex: value.length, format });
        value += fragment.text;
      }
      const userEnteredFormat: Record<string, unknown> = { wrapStrategy: "WRAP", verticalAlignment: "TOP", padding: { top: 8, bottom: 8, left: 9, right: 9 }, textFormat: { fontFamily: "Arial", fontSize: block.type === "heading" ? (block.depth === 1 ? 14 : 12) : 10, bold: baseBold, foregroundColor: block.type === "tableHeader" ? { red: 1, green: 1, blue: 1 } : dark } };
      if (block.type === "heading") userEnteredFormat.backgroundColor = light;
      if (block.type === "tableHeader") userEnteredFormat.backgroundColor = dark;
      if (block.type === "tableRow") userEnteredFormat.backgroundColor = rowIndex % 2 ? soft : { red: 1, green: 1, blue: 1 };
      if (isTable) userEnteredFormat.borders = { top: border, bottom: border, left: border, right: border };
      return { userEnteredValue: { stringValue: value }, userEnteredFormat, ...(value && textFormatRuns.length ? { textFormatRuns } : {}) };
    });
    const longest = Math.max(0, ...block.cells.map((cell) => cell.map((part) => part.text).join("").length));
    const charsPerLine = isTable ? 25 : width * 24;
    rowMetadata.push({ pixelSize: Math.min(400, Math.max(32, 18 * Math.ceil(longest / charsPerLine) + 16)) });
    return { values };
  });
  return { rowData, merges, rowMetadata, columnMetadata: Array.from({ length: width }, () => ({ pixelSize: 180 })), width };
}
