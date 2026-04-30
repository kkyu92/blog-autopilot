#!/usr/bin/env node
// 단일 Blogger Post의 raw content를 fetch해서 출력 (patch 설계용).
//
// 사용:
//   node --env-file=.env.local scripts/blogger/inspect-post.mjs <postId>

const POST_ID = process.argv[2];
if (!POST_ID) {
  console.error("usage: inspect-post.mjs <postId>");
  process.exit(1);
}

const BLOG_ID = process.env.GOOGLE_BLOG_ID;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }),
});
const { access_token } = await tokenRes.json();

const res = await fetch(
  `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${POST_ID}`,
  { headers: { Authorization: `Bearer ${access_token}` } }
);
if (!res.ok) {
  console.error(`fetch fail: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const post = await res.json();
console.log(`title: ${post.title}`);
console.log(`url: ${post.url}`);
console.log(`content length: ${post.content.length} chars`);
console.log(`---LAST 800 CHARS---`);
console.log(post.content.slice(-800));
console.log(`---FIRST 600 CHARS---`);
console.log(post.content.slice(0, 600));

if (post.content.includes("appear.go.kr")) {
  const idx = post.content.indexOf("appear.go.kr");
  console.log(`\n---'appear.go.kr' CONTEXT (idx=${idx})---`);
  console.log(post.content.slice(Math.max(0, idx - 200), idx + 200));
}
