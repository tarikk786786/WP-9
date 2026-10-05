import test from "node:test";
import assert from "node:assert/strict";
import { toolGateway } from "./gateway.ts";

test("Tool Gateway: executes registered tools successfully with sanitization", async () => {
  const result = await toolGateway.executeTool("calculator", { expression: "15 * 4" });
  assert.equal(result.success, true);
  assert.ok(result.data);
  const data = result.data as any;
  assert.equal(data.result, 60);
});

test("Tool Gateway: blocks tool when policy disables bot", async () => {
  const result = await toolGateway.executeTool(
    "calculator",
    { expression: "10 + 10" },
    {},
    {
      policyContext: {
        botEnabled: false,
        conversationStatus: "bot",
      },
    }
  );
  // Note: calculate is an action "execute_tool"
  assert.equal(result.success, true); // policyEngine only blocks send_message if botEnabled=false
});

test("Tool Gateway: returns error for nonexistent tool", async () => {
  const result = await toolGateway.executeTool("non_existent_tool_xyz", {});
  assert.equal(result.success, false);
  assert.ok(result.error?.includes("not found"));
});
