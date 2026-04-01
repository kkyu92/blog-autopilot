import { NextRequest, NextResponse } from "next/server";
import { exchangeNaverCode } from "@/lib/naver";
import { saveTokens } from "@/lib/tokens";

// GET /api/auth/naver/callback — OAuth 콜백
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

  // state nonce 검증
  const savedState = request.cookies.get("naver_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      new URL("/settings?error=invalid_state", request.url)
    );
  }

  try {
    const tokens = await exchangeNaverCode(code, state);
    await saveTokens("naver", tokens);

    const response = NextResponse.redirect(
      new URL("/settings?naver=connected", request.url)
    );
    response.cookies.delete("naver_oauth_state");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
