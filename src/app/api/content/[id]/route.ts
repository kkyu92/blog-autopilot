import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents } from "@/lib/schema";
import { eq } from "drizzle-orm";

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

// DELETE /api/content/[id] — 콘텐츠 삭제
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const [existing] = await db.select().from(contents).where(eq(contents.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(contents).where(eq(contents.id, id));
  return NextResponse.json({ ok: true });
}
