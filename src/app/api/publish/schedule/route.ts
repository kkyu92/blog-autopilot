import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents } from "@/lib/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";

// POST /api/publish/schedule — 예약 발행 설정
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contentId, scheduledAt, platform } = body;

  if (!contentId || !scheduledAt || !platform) {
    return NextResponse.json(
      { error: "contentId, scheduledAt, platform are required" },
      { status: 400 }
    );
  }

  if (!["blogger", "naver"].includes(platform)) {
    return NextResponse.json(
      { error: "platform must be blogger or naver" },
      { status: 400 }
    );
  }

  const scheduled = new Date(scheduledAt);
  if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
    return NextResponse.json(
      { error: "scheduledAt must be a future date" },
      { status: 400 }
    );
  }

  const [content] = await db
    .select()
    .from(contents)
    .where(eq(contents.id, contentId));

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  await db
    .update(contents)
    .set({
      scheduledAt: scheduled.toISOString(),
      scheduledPlatform: platform,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contents.id, contentId));

  return NextResponse.json({
    ok: true,
    contentId,
    scheduledAt: scheduled.toISOString(),
    platform,
  });
}

// DELETE /api/publish/schedule — 예약 취소
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { contentId } = body;

  if (!contentId) {
    return NextResponse.json(
      { error: "contentId is required" },
      { status: 400 }
    );
  }

  await db
    .update(contents)
    .set({
      scheduledAt: null,
      scheduledPlatform: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contents.id, contentId));

  return NextResponse.json({ ok: true });
}

// GET /api/publish/schedule — 예약된 발행 처리 (cron에서 호출)
export async function GET() {
  const now = new Date().toISOString();

  // 예약 시간이 지난 콘텐츠 조회
  const scheduled = await db
    .select()
    .from(contents)
    .where(
      and(
        isNotNull(contents.scheduledAt),
        isNotNull(contents.scheduledPlatform),
        lte(contents.scheduledAt, now),
        eq(contents.status, "draft")
      )
    );

  const results = [];

  for (const content of scheduled) {
    const platform = content.scheduledPlatform as "blogger" | "naver";

    try {
      // 내부 발행 API 호출
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/publish/${platform}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // same-origin 미들웨어 우회를 위해 auth 토큰 사용
          ...(process.env.AUTH_TOKEN
            ? { Authorization: `Bearer ${process.env.AUTH_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ contentId: content.id }),
      });

      const data = await res.json();

      // 예약 플래그 초기화
      await db
        .update(contents)
        .set({
          scheduledAt: null,
          scheduledPlatform: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(contents.id, content.id));

      results.push({
        contentId: content.id,
        title: content.title,
        platform,
        success: res.ok,
        url: data.externalUrl,
        error: data.error,
      });
    } catch (err) {
      results.push({
        contentId: content.id,
        title: content.title,
        platform,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
