import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getNaverAuthUrl } from "@/lib/naver";

// GET /api/auth/naver — OAuth 시작
export async function GET() {
  const state = nanoid();

  const authUrl = getNaverAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("naver_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
