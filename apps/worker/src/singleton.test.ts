import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { acquireWorkerLock, pidIsAlive, readLockPid, releaseWorkerLock } from "./singleton.ts";

describe("worker singleton lock", () => {
  it("lets the first process in and blocks a live second pid", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wa-lock-"));
    const first = acquireWorkerLock(dir, process.pid);
    assert.equal(first.ok, true);
    const second = acquireWorkerLock(dir, process.pid + 99991);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.pid, process.pid);
    releaseWorkerLock(dir, process.pid);
    const third = acquireWorkerLock(dir, process.pid + 1);
    assert.equal(third.ok, true);
    releaseWorkerLock(dir, process.pid + 1);
  });

  it("treats a dead pid lock as stale", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wa-lock-"));
    const dead = 2147483000;
    assert.equal(pidIsAlive(dead), false);
    writeFileSync(path.join(dir, "worker.lock"), `${dead}\n`);
    assert.equal(readLockPid(path.join(dir, "worker.lock")), dead);
    const got = acquireWorkerLock(dir, process.pid);
    assert.equal(got.ok, true);
    releaseWorkerLock(dir, process.pid);
  });
});
