import { NextResponse } from "next/server";
import { assistantRegistry } from "@bot/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const definition = assistantRegistry.getDefinition();
    return NextResponse.json({
      success: true,
      assistant: definition,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load assistant definition",
      },
      { status: 500 }
    );
  }
}
