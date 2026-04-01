import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const AUTH_TOKEN = process.env.AUTH_TOKEN;

  // Only protect API routes
  if (!request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip auth if no token configured (local dev)
  if (!AUTH_TOKEN) return NextResponse.next();

  // Skip OAuth callback (needs to be accessible)
  if (request.nextUrl.pathname.startsWith("/api/auth/blogger/callback")) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
