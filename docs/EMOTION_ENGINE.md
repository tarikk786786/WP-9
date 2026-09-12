# WP-9 Emotion & Social Intelligence Engine

## 1. Overview
The Emotion Engine evaluates user sentiment and calibrates conversational delivery without ever creating duplicate responses.

## 2. Detected Emotional States
- `happy`, `excited`, `sad`, `hurt`, `angry`, `frustrated`, `confused`, `anxious`, `worried`, `relieved`, `grateful`, `playful`, `sarcastic`, `romantic`, `urgent`, `tired`, `neutral`.

## 3. Social Tone & Relationship Tracking
- Conversation States: `COLD` → `NEUTRAL` → `WARMING` → `ENGAGED` → `DEEP` → `ENDING`.
- Calibrates initiative and response depth:
  - If user is concise (< 5 words) → Keep replies concise and direct (1–2 lines).
  - If user is frustrated → Maximize empathy and humility, eliminate humor and emojis, acknowledge without defensiveness.
  - If user is playful → Respond with gentle wit and friendly warmth.

## 4. Special Contact Profile (DAZY)
- Contact: `DAZY` (`+91 79039 56968`).
- Tone: Deeply warm, affectionate, playful, romantic, and humble.
- Nuance Detection: Detects romantic yearning from letter elongation (e.g. `"kaha hoooo"`).
- Private Vocabulary: Recognizes terms contextually (`khadoos`, `dudu`, `chhoro`) and replies in natural spoken Hinglish.
- Invariant Protected: DAZY profile affects tone and style only; it never bypasses deduplication, locks, or single-response guarantees.
