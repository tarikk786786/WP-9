import test from "node:test";
import assert from "node:assert/strict";
import { ThreeTierMemoryEngine } from "./three-tier-memory.ts";
import { CANONICAL_ASSISTANT_ID } from "@bot/shared";

test("Scoped Memory: isolates facts between contact and group scopes", () => {
  const memory = new ThreeTierMemoryEngine();

  // Contact facts
  memory.storeScopedFacts(
    "contact",
    "919876543210",
    [
      {
        category: "preference",
        key: "language",
        value: "hinglish",
        confidence: 0.9,
      },
    ],
    CANONICAL_ASSISTANT_ID
  );

  // Group facts
  memory.storeScopedFacts(
    "group",
    "group_dev_123",
    [
      {
        category: "project",
        key: "stack",
        value: "nextjs_baileys",
        confidence: 0.95,
      },
    ],
    CANONICAL_ASSISTANT_ID
  );

  const contactFacts = memory.getScopedFacts("contact", "919876543210", CANONICAL_ASSISTANT_ID);
  const groupFacts = memory.getScopedFacts("group", "group_dev_123", CANONICAL_ASSISTANT_ID);

  assert.equal(contactFacts.language, "hinglish");
  assert.equal(contactFacts.stack, undefined);

  assert.equal(groupFacts.stack, "nextjs_baileys");
  assert.equal(groupFacts.language, undefined);
});
