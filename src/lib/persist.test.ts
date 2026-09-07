import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { persistRoots, writablePath, writeToAllRoots } from "./writable-dir.ts";

describe("persist roots", () => {
  it("writes forever files under ./data locally", async () => {
    const rel = `probe-${Date.now()}.txt`;
    const ok = await writeToAllRoots(rel, "tarik-live");
    assert.equal(ok, true);
    assert.equal(existsSync(writablePath(rel)), true);
    assert.ok(persistRoots()[0].endsWith("/data"));
  });
});
