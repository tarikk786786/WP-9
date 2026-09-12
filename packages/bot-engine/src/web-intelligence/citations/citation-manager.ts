import type { SourceObject } from "../sources/source-model.ts";

export class CitationManager {
  public formatCitations(sources: SourceObject[], options?: { maxCitations?: number; style?: "inline" | "footer" }): string {
    if (sources.length === 0) return "";
    const limit = options?.maxCitations ?? 2;
    const selected = sources.slice(0, limit);
    const style = options?.style ?? "footer";

    const labels = selected.map((s) => {
      let label = s.publisher || s.title;
      if (label.length > 25) label = label.slice(0, 22) + "...";
      return label;
    });

    if (style === "footer") {
      return `\n\n(Source: ${labels.join(", ")})`;
    }
    return ` [${labels.join(", ")}]`;
  }
}

export const citationManager = new CitationManager();
