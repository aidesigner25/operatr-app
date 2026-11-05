import assert from "node:assert/strict";
import { test } from "node:test";
import { joinContinuationMarkdown, continuationMarkdown } from "../src/lib/shared/continuation-markdown.ts";
import { markdownBlocks } from "../src/lib/server/google-format.ts";
const suffix = "\n\n### Retrieved research links\nThese links were returned by the research tool; they are not necessarily citations for every claim above.\n- [Link](https://example.com)";
test("joins table rows across interrupted replies and keeps research links", () => {
  const first = "Heading\n\n| Factor | Notes |\n| --- | --- |\n| Growth | Strong |" + suffix;
  const second = "| Risk | Moderate |\n\nConclusion";
  const joined = joinContinuationMarkdown([first, second]);
  const blocks = markdownBlocks(joined);
  assert.equal(blocks.filter((block) => block.type === "tableRow").length, 2);
  assert.match(joined, /\[Link\]\(https:\/\/example.com\)/);
  assert.match(continuationMarkdown(first, second), /^\| Factor \| Notes \|\n\| --- \| --- \|\n\| Risk/);
});
test("repairs a row interrupted in the middle of a cell", () => {
  const first = "| Factor | Notes |\n| --- | --- |\n| Growth | Stron";
  const second = "g demand |\n| Risk | Moderate |";
  const joined = joinContinuationMarkdown([first, second]);
  assert.match(joined, /\| Growth \| Strong demand \|/);
  assert.equal(markdownBlocks(joined).filter((block) => block.type === "tableRow").length, 2);
  assert.match(continuationMarkdown(first, second), /\| Growth \| Strong demand \|/);
  assert.match(joinContinuationMarkdown(["| A | B |\n| --- | --- |\n| 1 | Some ", "word |"]), /Some word/);
});
test("does not force unrelated prose into the previous table", () => {
  const first = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  assert.equal(joinContinuationMarkdown([first, "Next paragraph"]), `${first}\n\nNext paragraph`);
  assert.equal(continuationMarkdown(first, "Next paragraph"), "Next paragraph");
});
