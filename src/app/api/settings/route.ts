import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getTokens } from "@/lib/tokens";

// GET /api/settings — 설정 조회
export async function GET() {
  const rows = await db.select().from(settings);
  const result: Record<string, string> = {};

  for (const row of rows) {
    // 토큰은 연결 상태만 반환
    if (row.key.endsWith("_tokens")) {
      try {
        const tokens = JSON.parse(row.value);
        result[row.key] = tokens.access_token ? "connected" : "disconnected";
      } catch {
        result[row.key] = "disconnected";
      }
    } else if (row.key === "claude_api_key") {
      // API 키는 마스킹
      result[row.key] = row.value ? `${row.value.slice(0, 8)}...` : "";
    } else {
      result[row.key] = row.value;
    }
  }

  // 플랫폼별 연결 상태
  const bloggerTokens = await getTokens("blogger");
  const naverTokens = await getTokens("naver");

  return NextResponse.json({
    settings: result,
    connections: {
      blogger: bloggerTokens ? "connected" : "disconnected",
      naver: naverTokens ? "connected" : "disconnected",
    },
  });
}

// PUT /api/settings — 설정 업데이트
export async function PUT(request: NextRequest) {
  const body = await request.json();

  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "string") continue;
    // 토큰은 직접 수정 불가
    if (key.endsWith("_tokens")) continue;

    const [existing] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key));

    if (existing) {
      await db
        .update(settings)
        .set({ value })
        .where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }
  }

  return NextResponse.json({ ok: true });
}
