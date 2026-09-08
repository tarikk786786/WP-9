import { NextResponse } from "next/server";
import { adminCookieName, adminSessionToken, isValidAdminSecret } from "@/lib/admin-auth";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isRateLimited("admin-login", 8)) {
    return NextResponse.json({ error: "Too many login attempts." }, { status: 429 });
  }
  const body = (await request.json()) as { secret?: string };
  if (!isValidAdminSecret(body.secret ?? "")) {
    return NextResponse.json({ error: "Invalid admin secret." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName(), adminSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName(), "", { path: "/", maxAge: 0 });
  return response;
}
