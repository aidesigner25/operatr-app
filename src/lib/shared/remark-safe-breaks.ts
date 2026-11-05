import type { Root } from "mdast";

/** Translate only literal line-break tags; other HTML remains disabled in ReactMarkdown. */
export function remarkSafeBreaks() {
  return (tree: Root) => {
    const visit = (node: { type: string; value?: string; children?: unknown[] }) => {
      if (node.type === "html" && typeof node.value === "string" && /^<br\s*\/?>$/i.test(node.value.trim())) {
        node.type = "break";
        delete node.value;
      }
      for (const child of node.children || []) visit(child as typeof node);
    };
    visit(tree);
  };
}
