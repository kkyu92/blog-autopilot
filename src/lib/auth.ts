import { NextRequest, NextResponse } from "next/server";

const AUTH_TOKEN = process.env.AUTH_TOKEN;

export function verifyAuth(request: NextRequest): NextResponse | null {
  // Skip auth if no token configured (local dev convenience)
  if (!AUTH_TOKEN) return null;

  const header = request.headers.get("authorization");
  if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
