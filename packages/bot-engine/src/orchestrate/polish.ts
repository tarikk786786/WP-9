import { isAskingIfMachine, type MessageAnalysis } from "../ai/analyze.ts";
import { stripModelNoise } from "./compose.ts";
import { isCannedFallback, softenGenderedAddress, writeSpokenReply } from "./spoken.ts";

const SALES = /\b(we can definitely|i'd be happy|feel free|let me know how i can|looking forward|reach out|check kar sakte ho|aage badhenge|audits are my thing|i’ll check my schedule|i'll check my schedule|i'm mostly around|leave a note|note chhod|the best|world-class|guaranteed|brief chahiye|3 lines mein|kis ke liye, kab tak|rate final|rate scope pe depend|scope pe depend|on behalf|kaam ho sakta hai|exactly kya banana)\b/i;

export function polishHumanReply(text: string, incoming: string, analysis: MessageAnalysis): string {
  let out = stripModelNoise(text.replace(/\r/g, "").trim());
  out = out.replace(/^[A-Z][a-z]{1,12},\s+/, "");
  out = out.replace(/^ayaan[,:]?\s*/i, "");
  out = out.replace(/^bolo[!.]?\s*/i, "");
  out = out.replace(/^hey[,.]?\s*bolo[!.]?\s*/i, "");
  const userGreeted = /^(hi|hey|hello|yo)\b/i.test(incoming.trim());
  if (userGreeted) {
    out = out.replace(/^(hey[,.]?\s*)?(haan[,.]?\s*)?(bolo|sure)[!.]?\s*/i, "");
    out = out.replace(/^hey[,\s]+/i, "");
    out = out.replace(/^kya scene hai[!.]?\s*/i, "");
  }
  out = out.replace(/\b(Hey|Hi|Hello),?\s+(sure|definitely)[.!]?\s*/g, "");
  out = out.replace(/\bWe can definitely[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bI('m| am) mostly around[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bleave a note[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bYeah,\s*/g, "haan, ");
  out = out.replace(/\baudits are my thing[.!]?\s*/gi, "");
  out = out.replace(/\bfeel free to (reach out|ask)[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\brate scope pe depend karta hai[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bscope pe depend[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bexactly kya banana hai[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bnote chhod dena[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bwebsite ka kaam ho sakta hai[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bavailability theek hai[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\b(as an ai|i am (an? )?(ai|bot|chatgpt|language model)|i'm (an? )?(ai|bot)|personal ai|auto[- ]?reply( bot)?|chat ?bot)\b[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bmain (ek )?(ai|bot|chatgpt) hoon[^.?\n]*[.!]?\s*/gi, "");
  out = out.replace(/\bnahi[, ]+(main )?(ai|bot) nahi[^.?\n]*[.!]?\s*/gi, "");
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
  if (!clean || /as an ai|i am (an? )?(ai|bot)|personal ai|chat ?bot|auto[- ]?repl/i.test(clean)) {
    clean = isAskingIfMachine(incoming) ? "ji, main hi hoon. boliye" : clean.replace(/as an ai[, ]*/i, "").trim();
  }
  if (!clean || isCannedFallback(clean)) clean = writeSpokenReply(incoming, analysis);
  return softenGenderedAddress(blendSpokenReply(clean, analysis));
}

export function blendSpokenReply(text: string, analysis: MessageAnalysis): string {
  let lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!analysis.topics.includes("location")) {
    lines = lines
      .map((line) =>
        line
          .replace(/\bmain (bhubaneswar,?\s*)?india se kaam karta hoon\.?\s*/gi, "")
          .replace(/\bbhubaneswar,?\s*india se kaam karta hoon\.?\s*/gi, "")
          .replace(/\bindia se kaam karta hoon\.?\s*/gi, "")
          .replace(/\bbased in (bhubaneswar,?\s*)?india\.?\s*/gi, "")
          .replace(/\bbhubaneswar[,.]?\s*/gi, "")
          .replace(/\s{2,}/g, " ")
          .replace(/^[,.\s]+/, "")
          .trim(),
      )
      .filter(Boolean);
  }
  if (!analysis.topics.includes("hours")) {
    lines = lines.filter((line) => !/\bdin mein aksar yahin|note chhod|avg 24 ghante\b/i.test(line));
  }
  if (!analysis.topics.includes("contact")) {
    lines = lines.filter((line) => !/gmail|89844|@tarik_islam_786|tarikk786786/i.test(line));
  }
  if (!analysis.topics.includes("credentials")) {
    lines = lines.filter((line) => !/\b(b\.sc|m\.sc|ceh|chfi|oscp)\b/i.test(line));
  }
  if (!analysis.topics.includes("availability")) {
    lines = lines.filter((line) => !/\bq3 2026\b/i.test(line));
  }

  const dezoIdx = lines.findIndex((line) => /\bdezo\b/i.test(line));
  const siteIdx = lines.findIndex((line) => /\btarikislam\.in\b/i.test(line));
  if (dezoIdx >= 0 && siteIdx >= 0 && dezoIdx !== siteIdx) {
    if (!/\btarikislam\.in\b/i.test(lines[dezoIdx])) {
      lines[dezoIdx] = `${lines[dezoIdx].replace(/[.!?]+$/, "")} — public cheez tarikislam.in pe hai`;
    }
    lines.splice(siteIdx, 1);
  }

  const rateIdx = lines.findIndex((line) => /\bandaz se nahi bolta\b/i.test(line));
  const processIdx = lines.findIndex((line) => /\bpehle sunta\b/i.test(line));
  if (rateIdx >= 0 && processIdx >= 0 && rateIdx !== processIdx) {
    if (!/\bpehle sunta\b/i.test(lines[rateIdx])) {
      lines[rateIdx] = `${lines[rateIdx].replace(/[.!?]+$/, "")}, pehle sunta hoon, phir jo clear ho wohi kehta hoon`;
    }
    lines.splice(processIdx, 1);
  }

  const maxLines = analysis.preferredStyle === "complete" ? 5 : 3;
  const kept: string[] = [];
  let questions = 0;
  for (const line of lines) {
    if (!line) continue;
    if (/\?/.test(line)) {
      questions += 1;
      if (questions > 1) continue;
    }
    kept.push(line);
    if (kept.length >= maxLines) break;
  }
  return kept.join("\n").trim() || text.trim();
}
