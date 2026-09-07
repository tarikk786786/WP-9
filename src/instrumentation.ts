export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLiveLoop } = await import("@/lib/live");
    startLiveLoop();
  }
}
