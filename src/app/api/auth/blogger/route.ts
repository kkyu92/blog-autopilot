import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getBloggerAuthUrl } from "@/lib/blogger";

// GET /api/auth/blogger — OAuth 시작
export async function GET() {
  const state = nanoid();

  const authUrl = getBloggerAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  // state nonce를 쿠키에 저장 (CSRF 방지)
  response.cookies.set("blogger_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10분
    path: "/",
  });

  return response;
}
