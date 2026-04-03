import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getWordPressAuthUrl } from "@/lib/wordpress";

// GET /api/auth/wordpress — OAuth 시작
export async function GET() {
  const state = nanoid();
  const authUrl = getWordPressAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("wordpress_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
