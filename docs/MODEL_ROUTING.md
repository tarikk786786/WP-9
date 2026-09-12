# WP-9 Multi-Model Routing & Local AI Fallback

## 1. Routing Hierarchy
WP-9 routes turns through an adaptive 5-level hierarchy:

1. **Level 0 (Deterministic)**: Matched FAQs, keyword rules, and DAZY spelling intelligence instant matches (Latency: < 5ms).
2. **Level 1 (Fast Cloud AI)**: Groq (`llama-3.3-70b-versatile`) or Gemini (`gemini-2.0-flash`) for low-cost, low-latency turns.
3. **Level 2 (Strong Reasoning AI)**: OpenAI (`gpt-4o` / `gpt-4o-mini`) or Anthropic for complex multi-turn reasoning.
4. **Level 3 (Local AI / llama.cpp)**: Queries self-hosted OpenAI-compatible server (`LOCAL_AI_URL` or `LLAMA_CPP_URL`) if cloud providers encounter downtime, rate limits, or network timeouts.
5. **Level 4 (Deterministic Fallback)**: `writeCompleteFallback` stitches verified facts into natural language without hallucination.

## 2. Timeout & Abort Safeguards
All remote AI calls are bounded by an `AbortController` (4000ms timeout) to prevent turns from stalling.
