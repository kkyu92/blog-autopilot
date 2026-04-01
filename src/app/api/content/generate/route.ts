import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contents } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { generateContent, generateSeoMeta } from "@/lib/claude";
import { renderForPublish } from "@/lib/sanitize";

// POST /api/content/generate — Claude AI 스트리밍 생성
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contentId, keyword, tone, targetLength, sourceSummaries } = body;

  if (!contentId || !keyword) {
    return new Response(
      JSON.stringify({ error: "contentId and keyword are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 콘텐츠 레코드 존재 확인
  const [existing] = await db
    .select()
    .from(contents)
    .where(eq(contents.id, contentId));
  if (!existing) {
    return new Response(JSON.stringify({ error: "Content not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const abortController = new AbortController();

  // 클라이언트 연결 해제 시 Claude API 호출 중단
  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = generateContent({
          keyword,
          tone: tone || "informative",
          targetLength: targetLength || 2500,
          sourceSummaries,
          signal: abortController.signal,
        });

        for await (const chunk of generator) {
          fullText += chunk;
          // SSE format
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
        }

        // 생성 완료 — DB 저장
        const bodyHtml = renderForPublish(fullText);
        const now = new Date().toISOString();

        await db
          .update(contents)
          .set({ body: fullText, bodyHtml, updatedAt: now })
          .where(eq(contents.id, contentId));

        // SEO 메타데이터 비동기 생성
        try {
          const seo = await generateSeoMeta(existing.title, fullText);
          await db
            .update(contents)
            .set({
              seoTitle: seo.seoTitle,
              seoDescription: seo.seoDescription,
              seoTags: JSON.stringify(seo.seoTags),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(contents.id, contentId));

          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ seo, done: true })}\n\n`
            )
          );
        } catch {
          // SEO 생성 실패해도 본문은 이미 저장됨
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ done: true })}\n\n`
            )
          );
        }

        controller.close();
      } catch (err) {
        if (abortController.signal.aborted) {
          // 클라이언트가 중단한 경우 — 부분 저장
          if (fullText.length > 0) {
            const now = new Date().toISOString();
            await db
              .update(contents)
              .set({ body: fullText, updatedAt: now })
              .where(eq(contents.id, contentId));
          }
          controller.close();
          return;
        }

        const message =
          err instanceof Error ? err.message : "Generation failed";
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ error: message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
