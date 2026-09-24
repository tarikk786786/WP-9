import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

console.log("[auto-clean] Starting automated workspace, database, and cache cleanup...");

let totalReclaimedBytes = 0;

function removeDirRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        removeDirRecursive(fullPath);
      } else {
        const stat = fs.statSync(fullPath);
        totalReclaimedBytes += stat.size;
        fs.unlinkSync(fullPath);
      }
    }
    fs.rmdirSync(dirPath);
    console.log(`[auto-clean] Removed directory: ${path.relative(repoRoot, dirPath)}`);
  } catch (err) {
    console.warn(`[auto-clean] Warning cleaning ${dirPath}:`, err.message);
  }
}

function removeFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const stat = fs.statSync(filePath);
    totalReclaimedBytes += stat.size;
    fs.unlinkSync(filePath);
    console.log(`[auto-clean] Removed file: ${path.relative(repoRoot, filePath)}`);
  } catch (err) {
    console.warn(`[auto-clean] Warning removing file ${filePath}:`, err.message);
  }
}

// 1. Clean Next.js build caches in apps/web
const webNextCache = path.join(repoRoot, "apps", "web", ".next", "cache");
if (fs.existsSync(webNextCache)) {
  removeDirRecursive(webNextCache);
}

// 2. Clean unneeded caches and temp in video platform if present
const videoPlatformNext = path.join(repoRoot, "video platform", ".next");
if (fs.existsSync(videoPlatformNext)) {
  removeDirRecursive(videoPlatformNext);
}

// 3. Clean stale SQLite WAL and SHM files
const walFile = path.join(repoRoot, "data", "bot.sqlite-wal");
const shmFile = path.join(repoRoot, "data", "bot.sqlite-shm");
removeFileIfExists(walFile);
removeFileIfExists(shmFile);

// 4. Clean stale worker PID and lock files
const pidFile = path.join(repoRoot, "data", "worker.pid");
const lockFile = path.join(repoRoot, "data", "worker.lock");
removeFileIfExists(pidFile);
removeFileIfExists(lockFile);

// 5. Clean test/build artifacts
const distFolder = path.join(repoRoot, "dist");
if (fs.existsSync(distFolder)) {
  removeDirRecursive(distFolder);
}

const reclaimedMB = (totalReclaimedBytes / (1024 * 1024)).toFixed(2);
console.log(`[auto-clean] Done! Successfully reclaimed ${reclaimedMB} MB of space.`);
