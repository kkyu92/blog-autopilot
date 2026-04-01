import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents, publications } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getValidNaverTokens, publishToNaver } from "@/lib/naver";
import { renderForPublish } from "@/lib/sanitize";

// POST /api/publish/naver — 네이버 블로그 발행
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contentId } = body;

  if (!contentId) {
    return NextResponse.json(
      { error: "contentId is required" },
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

  const tokens = await getValidNaverTokens();
  if (!tokens) {
    return NextResponse.json(
      { error: "Naver not connected. Please connect in settings." },
      { status: 401 }
    );
  }

  const pubId = nanoid();
  await db.insert(publications).values({
    id: pubId,
    contentId,
    platform: "naver",
    status: "pending",
  });

  try {
    const html = content.bodyHtml || renderForPublish(content.body);

    const result = await publishToNaver({
      accessToken: tokens.access_token,
      title: content.seoTitle || content.title,
      html,
    });

    const now = new Date().toISOString();
    await db
      .update(publications)
      .set({
        status: "published",
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";

    await db
      .update(publications)
      .set({ status: "failed", errorMessage: message })
      .where(eq(publications.id, pubId));

    await db
      .update(contents)
      .set({ status: "failed", updatedAt: new Date().toISOString() })
      .where(eq(contents.id, contentId));

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
