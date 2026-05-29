#!/usr/bin/env node
// Blogger Pages 3종 (About/Privacy/Contact) 본문 + 제목 일괄 갱신.
//
// docs/blogger/{about,privacy,contact}.html 의 내용을 그대로 PUT.
// 4/29 수동 게시 시 Blogger 에디터가 <a> 태그를 stripped + Contact placeholder
// 미치환 등 손상이 누적되어 API로 강제 덮어쓰기.
//
// 사용:
//   node --env-file=.env.local scripts/blogger/update-pages.mjs            # dry-run
//   node --env-file=.env.local scripts/blogger/update-pages.mjs --apply    # 실제 PUT

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const APPLY = process.argv.includes("--apply");

const BLOG_ID = process.env.GOOGLE_BLOG_ID;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!BLOG_ID || !REFRESH_TOKEN || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("[FATAL] env missing: GOOGLE_BLOG_ID / GOOGLE_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
  process.exit(1);
}

// 매핑: 현재 페이지 식별자(제목 키워드) → 새 제목 + 본문 파일
const TARGETS = [
  { matchTitleAny: ["About", "소개", "부동산시그널 소개"], newTitle: "부동산시그널 소개", file: "docs/blogger/about.html" },
  { matchTitleAny: ["Privacy", "개인정보"],                  newTitle: "개인정보 처리방침", file: "docs/blogger/privacy.html" },
  { matchTitleAny: ["Contact", "문의"],                       newTitle: "문의 (Contact)",     file: "docs/blogger/contact.html" },
];

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    throw new Error(`token refresh fail: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function listPages(accessToken) {
  // status=draft,live 명시 (디폴트는 live만)
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages?fetchBodies=false&status=live&status=draft&maxResults=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`list pages fail: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.items || [];
}

async function updatePage(accessToken, pageId, title, content) {
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages/${pageId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: "blogger#page",
      id: pageId,
      title,
      content,
    }),
  });
  if (!res.ok) {
    throw new Error(`update page ${pageId} fail: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function insertPage(accessToken, title, content) {
  // POST 는 DRAFT 로 생성. 이후 publish API 로 LIVE 전환.
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: "blogger#page",
      title,
      content,
    }),
  });
  if (!res.ok) {
    throw new Error(`insert page "${title}" fail: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function publishPage(accessToken, pageId) {
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages/${pageId}/publish`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`publish page ${pageId} fail: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

function stripCommentsAndTrim(html) {
  // <!-- ... --> 제거 (공개 페이지에 메타 정보 노출 방지)
  return html.replace(/<!--[\s\S]*?-->\s*/g, "").trim();
}

(async () => {
  console.log(`[mode] ${APPLY ? "APPLY (실제 PUT 수행)" : "DRY-RUN (변경 없이 미리보기만)"}`);
  console.log(`[blog] ${BLOG_ID}`);

  const token = await getAccessToken();
  console.log("[auth] access token 획득");

  const pages = await listPages(token);
  console.log(`[list] 총 페이지 ${pages.length}개`);
  pages.forEach((p) => console.log(`       - id=${p.id} status=${p.status} title="${p.title}" url=${p.url || "(draft)"}`));

  const summary = [];

  for (const target of TARGETS) {
    const filePath = path.join(REPO_ROOT, target.file);
    const rawHtml = fs.readFileSync(filePath, "utf-8");
    const cleanHtml = stripCommentsAndTrim(rawHtml);
    const match = pages.find((p) => target.matchTitleAny.some((t) => (p.title || "").includes(t)));

    if (!match) {
      // 5/29 AdSense reject family: Privacy/Contact 누락 → AdSense reviewer 가 "신뢰성 부족" 으로 reject.
      // INSERT + PUBLISH 로 자동 보강. status=draft 로 생성된 신규 페이지를 publish API 로 LIVE 전환.
      console.log(`\n[plan] INSERT new page "${target.newTitle}"`);
      console.log(`       new content: ${cleanHtml.length} chars from ${target.file}`);

      if (!APPLY) {
        summary.push({ target: target.newTitle, status: "DRY-INSERT" });
        continue;
      }

      try {
        const created = await insertPage(token, target.newTitle, cleanHtml);
        console.log(`       ✓ INSERT 성공 — id=${created.id} status=${created.status || "DRAFT"}`);
        let finalUrl = created.url;
        let finalStatus = created.status || "DRAFT";
        if (finalStatus !== "LIVE") {
          const published = await publishPage(token, created.id);
          finalUrl = published.url || finalUrl;
          finalStatus = published.status || "LIVE";
          console.log(`       ✓ PUBLISH 성공 — url=${finalUrl} status=${finalStatus}`);
        }
        summary.push({ target: target.newTitle, status: "INSERTED", id: created.id, url: finalUrl });
      } catch (e) {
        console.error(`       ✗ INSERT/PUBLISH 실패: ${e.message}`);
        summary.push({ target: target.newTitle, status: "FAIL-INSERT", error: e.message });
      }
      continue;
    }

    console.log(`\n[plan] UPDATE page id=${match.id}`);
    console.log(`       current title: "${match.title}"`);
    console.log(`       new     title: "${target.newTitle}"`);
    console.log(`       new content: ${cleanHtml.length} chars from ${target.file}`);

    if (!APPLY) {
      summary.push({ target: target.newTitle, status: "DRY-UPDATE", id: match.id });
      continue;
    }

    try {
      const result = await updatePage(token, match.id, target.newTitle, cleanHtml);
      console.log(`       ✓ PUT 성공 — url=${result.url || "(draft)"}`);
      summary.push({ target: target.newTitle, status: "OK", id: match.id, url: result.url });
    } catch (e) {
      console.error(`       ✗ PUT 실패: ${e.message}`);
      summary.push({ target: target.newTitle, status: "FAIL", id: match.id, error: e.message });
    }
  }

  console.log(`\n[summary]`);
  console.table(summary);

  if (!APPLY) {
    console.log(`\n→ 변경 적용하려면: --apply 추가하여 재실행`);
  }
})().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
