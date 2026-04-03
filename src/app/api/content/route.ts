import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents, publications } from "@/lib/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// GET /api/content — 콘텐츠 목록 (발행 정보 포함)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = db.select().from(contents).orderBy(desc(contents.updatedAt));

  if (status && ["draft", "published", "failed"].includes(status)) {
    query = query.where(eq(contents.status, status as "draft" | "published" | "failed")) as typeof query;
  }

  const rows = await query;

  // 각 콘텐츠의 발행 정보 조회
  const pubs = await db.select().from(publications);
  const pubsByContent = new Map<string, { platform: string; externalUrl: string | null; status: string }[]>();
  for (const pub of pubs) {
    const list = pubsByContent.get(pub.contentId) || [];
    list.push({ platform: pub.platform, externalUrl: pub.externalUrl, status: pub.status });
    pubsByContent.set(pub.contentId, list);
  }

  const enriched = rows.map((row) => ({
    ...row,
    publications: pubsByContent.get(row.id) || [],
  }));

  return NextResponse.json(enriched);
}

// POST /api/content — 새 콘텐츠 생성
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, keywordId, tone } = body;

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
