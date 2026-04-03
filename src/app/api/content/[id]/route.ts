import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents, publications } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getValidBloggerTokens, deleteFromBlogger, listBlogs } from "@/lib/blogger";
import { getValidWordPressTokens, deleteFromWordPress } from "@/lib/wordpress";

type Params = { params: Promise<{ id: string }> };

// GET /api/content/[id] — 개별 콘텐츠 조회
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const [row] = await db.select().from(contents).where(eq(contents.id, id));

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

// PUT /api/content/[id] — 콘텐츠 수정
export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const [existing] = await db.select().from(contents).where(eq(contents.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.title !== undefined) updates.title = body.title;
  if (body.body !== undefined) updates.body = body.body;
  if (body.bodyHtml !== undefined) updates.bodyHtml = body.bodyHtml;
  if (body.status !== undefined) updates.status = body.status;
  if (body.tone !== undefined) updates.tone = body.tone;
  if (body.seoTitle !== undefined) updates.seoTitle = body.seoTitle;
  if (body.seoDescription !== undefined) updates.seoDescription = body.seoDescription;
  if (body.seoTags !== undefined) updates.seoTags = body.seoTags;
  if (body.sourceUrls !== undefined) updates.sourceUrls = body.sourceUrls;

  const [row] = await db
    .update(contents)
    .set(updates)
    .where(eq(contents.id, id))
    .returning();

  return NextResponse.json(row);
}

// DELETE /api/content/[id] — 콘텐츠 + 외부 플랫폼 글 삭제
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const [existing] = await db.select().from(contents).where(eq(contents.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 외부 플랫폼에서 발행된 글 삭제
  const pubs = await db.select().from(publications).where(eq(publications.contentId, id));
  const deleteResults: { platform: string; success: boolean; error?: string }[] = [];

  for (const pub of pubs) {
    if (pub.status !== "published" || !pub.externalId) continue;

    try {
      if (pub.platform === "blogger") {
        const tokens = await getValidBloggerTokens();
        if (tokens) {
          const blogs = await listBlogs(tokens.access_token);
          if (blogs.length > 0) {
            await deleteFromBlogger({
              accessToken: tokens.access_token,
              blogId: blogs[0].id,
              postId: pub.externalId,
            });
          }
        }
        deleteResults.push({ platform: "blogger", success: true });
      } else if (pub.platform === "wordpress") {
        const tokens = await getValidWordPressTokens();
        if (tokens) {
          await deleteFromWordPress({
            accessToken: tokens.access_token,
            postId: pub.externalId,
          });
        }
        deleteResults.push({ platform: "wordpress", success: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      deleteResults.push({ platform: pub.platform, success: false, error: msg });
    }
  }

  // DB에서 삭제 (publications는 cascade로 함께 삭제됨)
  await db.delete(contents).where(eq(contents.id, id));
  return NextResponse.json({ ok: true, externalDeletes: deleteResults });
}
