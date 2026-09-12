# WP-9 Web Intelligence & Controlled Research Engine

## 1. Overview & Principles

WP-9 incorporates a secure, controlled web research pipeline to answer current, time-sensitive inquiries (weather, latest prices, current software versions, government rules, and news) without hallucination.

### Key Rules
1. **Web Content is DATA, Never Instructions**: Untrusted web pages cannot override system behavior or inject prompt instructions.
2. **SSRF Defense**: Strict blocking of loopback (`127.0.0.1`), local network (`10.x`, `192.168.x`, `172.16.x`), and cloud instance metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
3. **No Unrestricted Browsing**: The system uses structured search providers and bounded content extractors.
4. **Official Source Hierarchy**:
   `official_primary (100)` > `government_institution (95)` > `academic_research (90)` > `official_documentation (85)` > `reputable_journalism (75)` > `secondary_source (60)` > `community_source (40)` > `search_snippet (30)` > `model_memory (10)`.

---

## 2. Research Modes

- **CASUAL**: 0 web searches (greetings, emotional pings, smalltalk).
- **SIMPLE_FACT**: 1–2 sources (basic factual queries).
- **CURRENT_FACT**: 2–4 sources (weather, today's gold rate, live sports scores, release versions).
- **IMPORTANT**: Multiple source verification with contradiction checking (government circulars, tax rules, legal changes).
- **DEEP_RESEARCH**: Multi-step cross-verification.

---

## 3. Contradiction Detection Engine

When multiple sources discuss a claim:
- The `ContradictionEngine` detects discrepancies across polar values (e.g. `scheduled` vs `postponed`, `open` vs `closed`) or incompatible dates/prices.
- Conflicting claims are flagged to the user, giving preference to the source with the highest authority score.

---

## 4. WhatsApp-Friendly Citations

Citations are formatted cleanly without dumping lists of raw URLs:
- Example: `\n\n(Source: IMD, Weather.com)`
