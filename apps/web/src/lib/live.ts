import { discoverLocalLlms } from "@/lib/local-llm";
import { hydrateScanSnapshot } from "@/lib/scan-session";
import { flushStore } from "@/lib/store";
import { getTarikProfile, scheduleProfileRefresh } from "@/lib/tarik-profile";
import type { LiveStatus } from "@/lib/types";
import { isServerlessDisk } from "@/lib/writable-dir";

const startedAt = new Date().toISOString();

const HINGLISH_ONLY = [
  {
    id: "hinglish",
    name: "Hinglish soft voice",
    kind: "hinglish" as const,
    online: true,
    live: true,
    models: ["always-live · calm Hinglish"],
  },
];

export async function getLiveStatus(): Promise<LiveStatus> {
  scheduleProfileRefresh();
  return {
    alive: true,
    startedAt,
    whatsapp: await hydrateScanSnapshot(),
    llms: isServerlessDisk() ? HINGLISH_ONLY : await discoverLocalLlms(),
    profile: getTarikProfile(),
  };
}

export async function keepAliveTick() {
  await flushStore();
}
