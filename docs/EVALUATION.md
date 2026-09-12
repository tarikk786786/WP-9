# WP-9 Master Evaluation & Regression Suite

## 1. Automated Test Suites
WP-9 runs comprehensive test suites across the monorepo:

- `duplicates.test.ts`:
  - 100 identical events &rarr; strictly 1 accepted event.
  - 100 identical message IDs &rarr; strictly 1 dedup record.
  - Rejection of `messages.update` and `messaging-history.set`.
  - Atomic commit conflict rejection (second commit for same `turnId` rejected).
- `web-research.test.ts`:
  - Strict SSRF blocking of private IP ranges (`127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`).
  - Prompt injection neutralization in web data.
  - Contradiction detection across polar values and conflicting claims.
  - Inquiry classification into research modes (`CASUAL`, `CURRENT_FACT`, `IMPORTANT`).
- `personality-skills.test.ts`:
  - Smalltalk skill verification for pleasantries.
  - Business skill verification for portfolio and rates.
  - Dynamic personality adaptation for frustrated users vs DAZY.
- `dazy-spelling-intelligence.test.ts`:
  - Typo normalization (`khaduss`, `churo`, `dudu`, `acha`, `btao`, `krna`).
  - Emotional nuance detection from letter elongation (`kaha hoooo`).
- `language-quality-engine.test.ts`:
  - Elimination of arrogance and superior statements.
  - Spelling corrections (`definately`, `recieve`, `becoz`, `thsi`, `teh`).
  - Punctuation and WhatsApp naturalness scoring.

## 2. Key Metrics
- **MULTIPLE_RESPONSE_RATE**: Strictly 0.00%.
- **VALID_REPLY_LOSS_RATE**: Approach 0%.
