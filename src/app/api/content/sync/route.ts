import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contents, publications } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getValidBloggerTokens, listBlogs, listBloggerPosts } from "@/lib/blogger";
import { getValidWordPressTokens, listWordPressPosts } from "@/lib/wordpress";

// POST /api/content/sync — 외부 플랫폼 게시글 싱크
export async function POST() {
  const results = {
    blogger: { synced: 0, existing: 0, error: null as string | null },
    wordpress: { synced: 0, existing: 0, error: null as string | null },
  };

  // 기존 publications에서 externalId 목록 수집
  const existingPubs = await db.select().from(publications);
  const existingExternalIds = new Set(
    existingPubs
      .filter(p => p.externalId)
      .map(p => `${p.platform}:${p.externalId}`)
  );

  // 1. Blogger 싱크
  try {
    const tokens = await getValidBloggerTokens();
    if (tokens) {
      const blogs = await listBlogs(tokens.access_token);
      for (const blog of blogs) {
        const posts = await listBloggerPosts(tokens.access_token, blog.id);
        for (const post of posts) {
          const key = `blogger:${post.id}`;
          if (existingExternalIds.has(key)) {
            results.blogger.existing++;
            continue;
          }

          // 새 글 → contents + publications에 추가
          const contentId = nanoid();
          const now = new Date().toISOString();

          // HTML에서 텍스트 추출 (간단히)
          const plainText = post.content
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          await db.insert(contents).values({
            id: contentId,
            title: post.title,
            body: plainText.slice(0, 10000),
            bodyHtml: post.content,
            status: "published",
            tone: "informative",
            sourceUrls: JSON.stringify(["synced:blogger"]),
            createdAt: post.published || now,
            updatedAt: now,
          });

          await db.insert(publications).values({
            id: nanoid(),
            contentId,
            platform: "blogger",
            externalId: post.id,
            externalUrl: post.url,
            status: "published",
            publishedAt: post.published || now,
          });

          existingExternalIds.add(key);
          results.blogger.synced++;
        }
      }
    }
  } catch (err) {
    results.blogger.error = err instanceof Error ? err.message : "Sync failed";
  }

  // 2. WordPress 싱크
  try {
    const tokens = await getValidWordPressTokens();
    if (tokens) {
      const posts = await listWordPressPosts(tokens.access_token);
      for (const post of posts) {
        const key = `wordpress:${String(post.id)}`;
        if (existingExternalIds.has(key)) {
          results.wordpress.existing++;
          continue;
        }

        const contentId = nanoid();
        const now = new Date().toISOString();

        const plainText = post.content
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        await db.insert(contents).values({
          id: contentId,
          title: post.title,
          body: plainText.slice(0, 10000),
          bodyHtml: post.content,
          status: "published",
          tone: "informative",
          sourceUrls: JSON.stringify(["synced:wordpress"]),
          createdAt: post.date || now,
          updatedAt: now,
        });

        await db.insert(publications).values({
          id: nanoid(),
          contentId,
          platform: "wordpress",
          externalId: String(post.id),
          externalUrl: post.url,
          status: "published",
          publishedAt: post.date || now,
        });

        existingExternalIds.add(key);
        results.wordpress.synced++;
      }
    }
  } catch (err) {
    results.wordpress.error = err instanceof Error ? err.message : "Sync failed";
  }

  return NextResponse.json({
    ok: true,
    ...results,
    total: {
      newlySynced: results.blogger.synced + results.wordpress.synced,
      alreadyExisting: results.blogger.existing + results.wordpress.existing,
    },
  });
}
