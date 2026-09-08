import { addInboxMessage } from "@/lib/store";
import type { ComposedReply } from "@/lib/compose-reply";
import type { InboxMessage } from "@/lib/types";

export async function recordReply(
  base: Omit<InboxMessage, "reply" | "skippedReason" | "engine">,
  decision: ComposedReply,
) {
  return addInboxMessage({
    ...base,
    reply: decision.action === "reply" ? decision.text : null,
    skippedReason: decision.action === "skip" ? decision.reason : null,
    engine: decision.engine,
  });
}
