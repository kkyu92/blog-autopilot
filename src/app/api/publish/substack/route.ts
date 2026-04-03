import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents, publications, settings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createSubstackDraft,
  publishSubstackDraft,
  loginToSubstack,
} from "@/lib/substack";
import { renderForPublish } from "@/lib/sanitize";
import { withRetry } from "@/lib/retry";

// 설정에서 Substack 인증 정보 조회
async function getSubstackConfig() {
  const rows = await db.select().from(settings);
  const config: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith("substack_")) {
      config[row.key] = row.value;
    }
  }
  return {
    subdomain: config.substack_subdomain || "",
    email: config.substack_email || "",
    password: process.env.SUBSTACK_PASSWORD || config.substack_password || "",
    cookie: config.substack_cookie || "",
  };
}

// Substack 쿠키 저장
async function saveSubstackCookie(cookie: string) {
  const key = "substack_cookie";
  const [existing] = await db.select().from(settings).where(eq(settings.key, key));
  if (existing) {
    await db.update(settings).set({ value: cookie }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value: cookie });
  }
}

// POST /api/publish/substack — Substack 발행
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contentId, publish = false } = body;

  if (!contentId) {
    return NextResponse.json(
      { error: "contentId is required" },
      { status: 400 }
    );
  }

  const config = await getSubstackConfig();
  if (!config.subdomain) {
    return NextResponse.json(
      { error: "Substack not configured. Set substack_subdomain in settings." },
      { status: 401 }
    );
  }

  // 콘텐츠 조회
  const [content] = await db
    .select()
    .from(contents)
    .where(eq(contents.id, contentId));

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // 쿠키 확보 (없으면 로그인 시도)
  let cookie = config.cookie;
  if (!cookie && config.email && config.password) {
    try {
      cookie = await loginToSubstack(config.email, config.password);
      await saveSubstackCookie(cookie);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Substack login failed: ${err instanceof Error ? err.message : "Unknown"}`,
        },
        { status: 401 }
      );
    }
  }

  if (!cookie) {
    return NextResponse.json(
      { error: "Substack authentication required. Set email/password or cookie in settings." },
      { status: 401 }
    );
  }

  // publication 레코드 생성
  const pubId = nanoid();
  await db.insert(publications).values({
    id: pubId,
    contentId,
    platform: "substack",
    status: "pending",
  });

  try {
    const html = content.bodyHtml || renderForPublish(content.body);

    // 1. 초안 생성 (재시도 포함)
    const draft = await withRetry(() =>
      createSubstackDraft({
        subdomain: config.subdomain,
        cookie,
        title: content.seoTitle || content.title,
        subtitle: content.seoDescription || "",
        html,
      })
    );

    let externalUrl = draft.draft_url;

    // 2. 발행 (선택, 재시도 포함)
    if (publish) {
      const published = await withRetry(() =>
        publishSubstackDraft({
          subdomain: config.subdomain,
          cookie,
          draftId: draft.id,
        })
      );
      externalUrl = published.url;
    }

    const now = new Date().toISOString();
    await db
      .update(publications)
      .set({
        status: "published",
        externalId: String(draft.id),
        externalUrl,
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
      externalUrl,
      draftId: draft.id,
      published: publish,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Substack publish failed";

    await db
      .update(publications)
      .set({ status: "failed", errorMessage: message })
      .where(eq(publications.id, pubId));

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
