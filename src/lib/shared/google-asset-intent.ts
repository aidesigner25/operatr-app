// A request to create a single file authorizes creation. Mere discussion,
// instructions, and references to previous files do not.
export function requestedGoogleAsset(prompt: string): "doc" | "sheet" | null {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (/\b(?:do not|don't|never|without|no need to|avoid)\s+(?:create|make|generate|export|save|write|provide|produce|give|build|need|want)\b/i.test(text)) return null;
  if (/\b(?:without|no need for)\s+(?:another|a|an|the|one more)\b.{0,70}\b(?:doc(?:ument)?|sheet|spreadsheet)\b/i.test(text)) return null;
  if (/\b(?:how (?:do|can|would|to)|explain how|instructions (?:on|for)|should (?:i|we))\b.{0,100}\b(?:create|make|generate|build)\b/i.test(text)) return null;
  // Other named output formats are not silently redirected to Google.
  if (/\b(?:word|microsoft|office|docx|pdf|excel|xlsx|csv)\b/i.test(text)) return null;

  const noun = "(?:doc(?:ument)?s?|sheet|spreadsheet)";
  const modifier = "(?:(?:new|brief|short|quick|simple|detailed|editable|concise|comparison|summary|research|formatted)\\s+){0,3}";
  const determiner = "(?:(?:a|an|the|my|another|one more|one other)\\s+)?";
  const target = `${determiner}${modifier}(?:google\\s+)?${noun}\\b`;
  const direct = new RegExp(`\\b(?:create|make|generate|prepare|build|export|save|write|need|want|like|provide|produce|give|get|draft)\\s+(?:(?:me|us)\\s+)?${target}`, "i");
  const convert = new RegExp(`\\b(?:turn|convert|put|save|create|make|prepare|write|produce)\\b.{0,100}\\b(?:as|into|in|to)\\s+${target}`, "i");
  const standalone = new RegExp(`^(?:please[, ]+)?(?:another|one more|one other)\\s+${modifier}(?:google\\s+)?${noun}\\b`, "i");
  const have = new RegExp(`\\b(?:could|can|may)\\s+i\\s+have\\s+${target}`, "i");
  if (!direct.test(text) && !convert.test(text) && !standalone.test(text) && !have.test(text)) return null;
  const doc = /\b(?:google\s+(?:docs?|documents?)|(?:a|an|the|my|another|one more|one other)\s+(?:(?:new|brief|short|quick|simple|detailed|editable|concise|comparison|summary|research|formatted)\s+){0,3}doc(?:ument)?)\b/i.test(text);
  const sheet = /\b(?:google\s+(?:sheets?|spreadsheets?)|(?:a|an|the|my|another|one more|one other)\s+(?:(?:new|brief|short|quick|simple|detailed|editable|concise|comparison|summary|research|formatted)\s+){0,3}(?:spreadsheet|sheet))\b/i.test(text);
  return doc === sheet ? null : doc ? "doc" : "sheet";
}
