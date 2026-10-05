/**
 * Hindi & Hinglish Speech Synthesis Text Formatter
 * Prepares raw LLM output into clean, spoken, phonetically natural speech.
 */

export class HindiSpeechFormatter {
  /**
   * Cleans text for high-fidelity spoken Hindi/Hinglish TTS
   */
  public static formatForSpeech(text: string): string {
    let clean = text.trim();

    // 1. Remove Markdown formatting (*, _, `, ~, #)
    clean = clean.replace(/[*_`~#]/g, "");

    // 2. Expand URLs into natural spoken format
    clean = clean.replace(/https?:\/\/(www\.)?dezo\.in\S*/gi, "dezo dot in");
    clean = clean.replace(/https?:\/\/(www\.)?tarikislam\.in\S*/gi, "tarik islam dot in");
    clean = clean.replace(/https?:\/\/\S+/gi, "link");

    // 3. Expand common abbreviations
    clean = clean.replace(/\bAI\b/g, "A.I.");
    clean = clean.replace(/\bCEO\b/g, "C.E.O.");
    clean = clean.replace(/\b₹\s*(\d+)/g, "$1 rupaye");
    clean = clean.replace(/\bRs\.?\s*(\d+)/gi, "$1 rupaye");

    // 4. Strip emojis (emojis should never be read out literally like "red heart" on calls)
    clean = clean.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "");

    // 5. Clean up multiple spaces, excessive punctuation, and newlines
    clean = clean.replace(/\n+/g, ". ");
    clean = clean.replace(/\s+/g, " ");
    clean = clean.replace(/\.{2,}/g, ".");

    return clean.trim();
  }

  public static prepareForVoice = HindiSpeechFormatter.formatForSpeech;
}
