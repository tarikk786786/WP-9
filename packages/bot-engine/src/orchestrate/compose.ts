export function stripModelNoise(text: string): string {
  let out = text.replace(/\r/g, "");
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "");
  out = out.replace(/<\/?think>/gi, "");
  out = out.replace(/<\|[^|]+\|>/g, "");
  out = out.replace(/^```[\w-]*\n?|\n?```$/g, "");
  out = out.replace(/\*\*(.*?)\*\*/g, "$1");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^\s*[-*•]\s+/gm, "");
  out = out.replace(/^\s*\d+[.)]\s+/gm, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
