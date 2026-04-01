import { NextRequest, NextResponse } from "next/server";
import { exchangeBloggerCode } from "@/lib/blogger";
import { saveTokens } from "@/lib/tokens";

// GET /api/auth/blogger/callback — OAuth 콜백
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?error=missing_params", request.url)
    );
  }

  // state nonce 검증 (CSRF 방지)
  const savedState = request.cookies.get("blogger_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      new URL("/settings?error=invalid_state", request.url)
    );
  }

  try {
    const tokens = await exchangeBloggerCode(code);
    await saveTokens("blogger", tokens);

    const response = NextResponse.redirect(
      new URL("/settings?blogger=connected", request.url)
    );
    // state 쿠키 삭제
    response.cookies.delete("blogger_oauth_state");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(
        `/settings?error=${encodeURIComponent(message)}`,
        request.url
      )
    );
  }
}
