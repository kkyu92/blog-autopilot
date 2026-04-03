import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents, publications } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getMediumUser, publishToMedium } from "@/lib/medium";
import { renderForPublish } from "@/lib/sanitize";
import { withRetry } from "@/lib/retry";
import { settings } from "@/lib/schema";

// POST /api/publish/medium — Medium 발행
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contentId, publishStatus = "draft" } = body;

  if (!contentId) {
    return NextResponse.json(
      { error: "contentId is required" },
      { status: 400 }
    );
  }

  // Medium Integration Token 조회
  const [tokenRow] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "medium_token"));

  if (!tokenRow?.value) {
    return NextResponse.json(
      { error: "Medium not connected. Set medium_token in settings." },
      { status: 401 }
    );
  }

  const integrationToken = tokenRow.value;

  // 콘텐츠 조회
  const [content] = await db
    .select()
    .from(contents)
    .where(eq(contents.id, contentId));

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // publication 레코드 생성
  const pubId = nanoid();
  await db.insert(publications).values({
    id: pubId,
    contentId,
    platform: "medium",
    status: "pending",
  });

  try {
    // 사용자 ID 조회
    const user = await getMediumUser(integrationToken);

    const html = content.bodyHtml || renderForPublish(content.body);
    const seoTags = content.seoTags ? JSON.parse(content.seoTags) : [];

    const result = await withRetry(() =>
      publishToMedium({
        integrationToken,
        authorId: user.id,
        title: content.seoTitle || content.title,
        html,
        tags: seoTags.slice(0, 5),
        publishStatus: publishStatus as "public" | "draft" | "unlisted",
      })
    );

    const now = new Date().toISOString();
    await db
      .update(publications)
      .set({
        status: "published",
        externalId: result.id,
        externalUrl: result.url,
        publishedAt: now,
      })
      .where(eq(publications.id, pubId));

    await db
      .update(contents)
      .set({ status: "published", updatedAt: now })
      .where(eq(contents.id, contentId));

    return NextResponse.json({
      ok: true,
      publicationId: pubId,
      externalUrl: result.url,
      publishStatus: result.publishStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Medium publish failed";

    await db
      .update(publications)
      .set({ status: "failed", errorMessage: message })
      .where(eq(publications.id, pubId));

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
