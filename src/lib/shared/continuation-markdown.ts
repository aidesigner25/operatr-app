// Research appendices may be attached to an interrupted segment after the
// model text. Move them after the reassembled content without losing links.
function detachSources(value: string) {
  const marker = "\n\n### Retrieved research links\nThese links were returned by the research tool; they are not necessarily citations for every claim above.\n";
  const at = value.lastIndexOf(marker);
  return at < 0 ? { body: value, sources: "" } : { body: value.slice(0, at), sources: value.slice(at) };
}
function tableContext(value: string) {
  const lines = detachSources(value).body.trimEnd().split("\n");
  let end = lines.length - 1;
  if (!/^\s*\|/.test(lines[end] || "")) return null;
  let start = end;
  while (start > 0 && /^\s*\|/.test(lines[start - 1])) start--;
  const table = lines.slice(start, end + 1);
  if (table.length < 2 || !/^\s*\|?\s*:?-{3,}/.test(table[1]) || !table[1].includes("|")) return null;
  return { header: table[0], separator: table[1], last: table.at(-1) || "" };
}
function continuationParts(previous: string, next: string) {
  const context = tableContext(previous);
  if (!context) return null;
  const nextText = next.trimStart();
  if (!nextText) return null;
  const lines = nextText.split("\n");
  const first = lines[0];
  const pipeStart = /^\s*\|/.test(first);
  const incomplete = !context.last.trimEnd().endsWith("|");
  // A leading text fragment is joined only to a visibly unfinished table row.
  if (!pipeStart && !incomplete) return null;
  if (!pipeStart && (!first.includes("|") || first.length > 1000)) return null;
  return { ...context, nextText, joinRow: incomplete && (!pipeStart || (context.last.match(/\|/g)?.length || 0) < (context.header.match(/\|/g)?.length || 0)) };
}

/** Reassemble segments for export, retaining ordinary paragraph boundaries. */
export function joinContinuationMarkdown(segments: string[]) {
  if (!segments.length) return "";
  let output = detachSources(segments[0]).body;
  const sources: string[] = [];
  const initial = detachSources(segments[0]).sources;
  if (initial) sources.push(initial);
  for (const segment of segments.slice(1)) {
    const next = detachSources(segment);
    const parts = continuationParts(output, next.body);
    if (parts) output = parts.joinRow
      ? output.replace(/\n+$/, "") + next.body.replace(/^\n+/, "")
      : output.trimEnd() + "\n" + parts.nextText;
    else output = `${output}\n\n${next.body}`;
    if (next.sources) sources.push(next.sources);
  }
  return output + sources.join("");
}

/** Provide a repeated header for a table continued in a separate chat bubble. */
export function continuationMarkdown(previous: string, current: string) {
  const parts = continuationParts(previous, current);
  if (!parts) return current;
  const body = parts.joinRow ? parts.last + current.replace(/^\n+/, "") : parts.nextText;
  return `${parts.header}\n${parts.separator}\n${body}`;
}
