import "server-only";

type Source = { title: string; url?: string };
/** Tool-provided links are listed as retrieved material, not proof of any particular claim. */
export function researchSourceSuffix(sources: Source[], answer: string) {
  if (!sources.length) return "";
  const unique = new Map<string, string>();
  for (const source of sources) {
    if (!source.url) continue;
    try {
      const url = new URL(source.url);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
      const safeUrl = url.toString().replace(/\)/g, "%29").replace(/\(/g, "%28");
      const title = source.title.replace(/[\[\]()<>{}\\\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || url.hostname;
      if (!unique.has(safeUrl)) unique.set(safeUrl, title);
    } catch { /* Ignore malformed links. */ }
  }
  if (!unique.size) return "\n\n*The research tool returned results without direct source links.*";
  const missing = [...unique.entries()].filter(([url]) => !answer.includes(`](${url})`)).slice(0, 12);
  if (!missing.length) return "";
  return `\n\n### Retrieved research links\nThese links were returned by the research tool; they are not necessarily citations for every claim above.\n${missing.map(([url, title]) => `- [${title}](${url})`).join("\n")}`;
}
