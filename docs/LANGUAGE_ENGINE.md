# WP-9 Language & Human Quality Engine

## 1. Multilingual Support
WP-9 natively understands and communicates in:
- English
- Hindi
- Hinglish (Everyday WhatsApp style)
- Bengali, Odia, Urdu, and romanized Indian scripts.

## 2. Inbound Multi-Stage Normalization Pipeline
User input is processed without mutating or overwriting the original raw text:
```text
rawText
  → Unicode Normalization (NFKC, zero-width strippers)
  → Repeated-Character & Elongation Normalization ("hoooo" → "ho", "krnaaa" → "karna")
  → Typo Normalization ("khaduss" → "khadoos", "btao" → "batao")
  → Phonetic Normalization ("churo" → "chhoro", "nhi" → "nahi")
  → Private Lexicon Resolution ("dudu", "khadoos")
  → Context & Reference Resolution ("ye", "woh", "iska")
  → Intent Extraction
```

## 3. Human Quality & Humility Gate (8 Stages)
Before committing any response:
1. **Spelling Checker**: Resolves typos (`definately` → `definitely`, `recieve` → `receive`, `becoz` → `because`, `thsi` → `this`) without damaging intentional WhatsApp slang.
2. **Grammar & Flow**: Simplifies bureaucratic and textbook English into spoken phrasing.
3. **Humility Checker**: Strips arrogant, defensive, or condescending statements:
   - Forbidden: *"Obviously"*, *"As I already told you"*, *"You are wrong"*, *"You don't understand"*.
   - Preferred: *"Haan, samjha"*, *"Acha, ab samjha"*, *"Shayad meri understanding galat thi"*, *"Ek sec, check karta hoon"*.
4. **Naturalness Engine**: Strips robotic corporate canned openings (*"Certainly! Absolutely! I would be happy to assist!"*). Ensures threshold score >= 85.
