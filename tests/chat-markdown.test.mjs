import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkSafeBreaks } from "../src/lib/shared/remark-safe-breaks.ts";
import { markdownBlocks } from "../src/lib/server/google-format.ts";

test("table break tags become line breaks while arbitrary HTML remains inert", () => {
  const content = "| Dimension | Details |\n| --- | --- |\n| Pros | First<br>Second<BR />Third<script>alert(1)</script> |";
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkSafeBreaks] }, content));
  assert.match(html, /First<br\/>\s*Second<br\/>\s*Third/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  const rows = markdownBlocks(content);
  assert.match(rows[1].cells[1].map((part) => part.text).join(""), /First\nSecond\nThird/);
});
