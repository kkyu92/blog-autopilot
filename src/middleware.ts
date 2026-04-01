import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const AUTH_TOKEN = process.env.AUTH_TOKEN;

  // Only protect API routes
  if (!request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip auth if no token configured (local dev)
  if (!AUTH_TOKEN) return NextResponse.next();

  // Skip OAuth callbacks and auth start
  if (request.nextUrl.pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Same-origin requests from the browser (have Referer or Sec-Fetch-Site)
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") {
    return NextResponse.next();
  }

  // External API calls require Bearer token
  const header = request.headers.get("authorization");
  if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
