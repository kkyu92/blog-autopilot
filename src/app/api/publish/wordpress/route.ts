import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents, publications } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getValidWordPressTokens, publishToWordPress } from "@/lib/wordpress";
import { renderForPublish } from "@/lib/sanitize";
import { withRetry } from "@/lib/retry";

// POST /api/publish/wordpress — WordPress 발행
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

  const tokens = await getValidWordPressTokens();
  if (!tokens) {
    return NextResponse.json(
      { error: "WordPress not connected. Please connect in settings." },
      { status: 401 }
    );
  }

  const pubId = nanoid();
  await db.insert(publications).values({
    id: pubId,
    contentId,
    platform: "wordpress",
    status: "pending",
  });

  try {
    const html = content.bodyHtml || renderForPublish(content.body);
    const seoTags = content.seoTags ? JSON.parse(content.seoTags) : [];

    const result = await withRetry(() =>
      publishToWordPress({
        accessToken: tokens.access_token,
        title: content.seoTitle || content.title,
        html,
        tags: seoTags,
      })
    );

    const now = new Date().toISOString();
    await db
      .update(publications)
      .set({
        status: "published",
        externalId: String(result.id),
        externalUrl: result.url,
        publishedAt: now,
      })
      .where(eq(publications.id, pubId));

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

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
