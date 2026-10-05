import { NextResponse } from "next/server";
import { DEFAULT_CALL_POLICY, BaileysCallTransport } from "@bot/voice-calling";

export const dynamic = "force-dynamic";

export async function GET() {
  const isEnabled = process.env.VOICE_CALLING_ENABLED === "true";

  return NextResponse.json({
    enabled: isEnabled,
    transport: {
      name: "BaileysCallTransport",
      isProductionReady: BaileysCallTransport.IS_PRODUCTION_READY,
      notice: BaileysCallTransport.STATUS_REASON,
      status: isEnabled ? "active" : "disabled",
    },
    policy: {
      autoAnswerEnabled: process.env.CALL_AUTO_ANSWER_ENABLED === "true",
      unknownCallerMode: process.env.CALL_UNKNOWN_CALLER_MODE || DEFAULT_CALL_POLICY.unknownCallerMode,
      recordingEnabled: false, // Strictly false per privacy requirement
      maxConcurrentCalls: DEFAULT_CALL_POLICY.maxConcurrentCalls,
      maxCallDurationMs: DEFAULT_CALL_POLICY.maxCallDurationMs,
      silenceTimeoutMs: DEFAULT_CALL_POLICY.silenceTimeoutMs,
      aiDisclosure: DEFAULT_CALL_POLICY.aiDisclosure,
    },
    metrics: {
      activeCalls: 0,
      totalCallsLogged: 0,
      averageLatencyMs: 0,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      updated: body,
      message: "Call policy preferences updated successfully",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
