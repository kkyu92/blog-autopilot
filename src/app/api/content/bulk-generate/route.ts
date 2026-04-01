import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { generateContent, generateSeoMeta } from "@/lib/claude";
import { renderForPublish } from "@/lib/sanitize";
import { nanoid } from "nanoid";

// POST /api/content/bulk-generate — 여러 키워드 일괄 생성
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { keywords, tone = "informative", targetLength = 2500 } = body;

  if (!Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json(
      { error: "keywords array is required" },
      { status: 400 }
    );
  }

  if (keywords.length > 10) {
    return NextResponse.json(
      { error: "Maximum 10 keywords per batch" },
      { status: 400 }
    );
  }

  const results = [];

  for (const keyword of keywords) {
    const contentId = nanoid();
    const now = new Date().toISOString();

    // draft 레코드 생성
    await db.insert(contents).values({
      id: contentId,
      title: keyword,
      body: "",
      status: "draft",
      tone,
      createdAt: now,
      updatedAt: now,
    });

    try {
      // 콘텐츠 생성
      let fullText = "";
      const generator = generateContent({ keyword, tone, targetLength });
      for await (const chunk of generator) {
        fullText += chunk;
      }

      const bodyHtml = renderForPublish(fullText);
      await db
        .update(contents)
        .set({ body: fullText, bodyHtml, updatedAt: new Date().toISOString() })
        .where(eq(contents.id, contentId));

      // SEO 메타데이터
      try {
        const seo = await generateSeoMeta(keyword, fullText);
        await db
          .update(contents)
          .set({
            seoTitle: seo.seoTitle,
            seoDescription: seo.seoDescription,
            seoTags: JSON.stringify(seo.seoTags),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(contents.id, contentId));
      } catch {
        // SEO 실패해도 본문은 저장됨
      }

      results.push({
        keyword,
        contentId,
        success: true,
        bodyLength: fullText.length,
      });
    } catch (err) {
      results.push({
        keyword,
        contentId,
        success: false,
        error: err instanceof Error ? err.message : "Generation failed",
      });
    }
  }

  return NextResponse.json({
    total: keywords.length,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
