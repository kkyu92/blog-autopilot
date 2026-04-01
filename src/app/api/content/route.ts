import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// GET /api/content — 콘텐츠 목록
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = db.select().from(contents).orderBy(desc(contents.updatedAt));

  if (status && ["draft", "published", "failed"].includes(status)) {
    query = query.where(eq(contents.status, status as "draft" | "published" | "failed")) as typeof query;
  }

  const rows = await query;
  return NextResponse.json(rows);
}

// POST /api/content — 새 콘텐츠 생성
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, keyword, keywordId, tone } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const id = nanoid();
  const now = new Date().toISOString();

  const [row] = await db
    .insert(contents)
    .values({
      id,
      title,
      body: "",
      keywordId: keywordId || null,
      tone: tone || "informative",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
