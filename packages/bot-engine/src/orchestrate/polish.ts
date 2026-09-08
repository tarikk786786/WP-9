import type { MessageAnalysis } from "../ai/analyze.ts";

const SALES = /\b(we can definitely|i'd be happy|feel free|let me know how i can|looking forward|reach out|check kar sakte ho|aage badhenge|audits are my thing|i’ll check my schedule|i'll check my schedule|i'm mostly around|leave a note|the best|world-class|guaranteed)\b/i;

export function polishHumanReply(text: string, incoming: string, analysis: MessageAnalysis): string {
  let out = text.replace(/\r/g, "").trim();
  out = out.replace(/^["']|["']$/g, "");
  const userGreeted = /^(hi|hey|hello|yo)\b/i.test(incoming.trim());
  if (userGreeted) {
    out = out.replace(/^(hey[,.]?\s*)?(haan[,.]?\s*)?(bolo|sure)[!.]?\s*/i, "");
    out = out.replace(/^hey[,\s]+/i, "");
  }
  out = out.replace(/\b(Hey|Hi|Hello),?\s+(sure|definitely)[.!]?\s*/g, "");
  out = out.replace(/\bWe can definitely[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bI('m| am) mostly around[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bleave a note[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bYeah,\s*/g, "haan, ");
  out = out.replace(/\baudits are my thing[.!]?\s*/gi, "");
  out = out.replace(/\bfeel free to (reach out|ask)[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bindia se kaam karta hoon[^.?\n]*[.!]?\s*/gi, "");
  if (!analysis.topics.includes("location")) {
    out = out.replace(/^meet tab[^\n]*\n?/gim, "");
  }

  const lines = out
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .filter((line, index, all) => all.findIndex((other) => other.toLowerCase() === line.toLowerCase()) === index);

  const maxLines = analysis.preferredStyle === "complete" ? 6 : 3;
  const kept: string[] = [];
  let questions = 0;
  for (const line of lines) {
    const isQ = /\?/.test(line);
    if (isQ) {
      questions += 1;
      if (questions > 1) continue;
    }
    kept.push(line);
    if (kept.length >= maxLines) break;
  }

  let clean = kept.join("\n").trim();
  if (!clean) clean = text.trim();
  if (SALES.test(clean)) {
    clean = clean
      .replace(SALES, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return clean;
}
