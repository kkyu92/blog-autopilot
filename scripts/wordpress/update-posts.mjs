#!/usr/bin/env node
// WordPress Posts 본문 patch 도구.
//
// 5/1 spot-check 결과 P0 fix:
//   - YMYL disclaimer 누락 글에 면책 고지 추가
//
// scripts/blogger/update-posts.mjs 와 대칭 — site 분기(TS/WS) 추가.
//
// 사용:
//   node --env-file=.env.local scripts/wordpress/update-posts.mjs           # dry-run
//   node --env-file=.env.local scripts/wordpress/update-posts.mjs --apply   # 실제 POST

const APPLY = process.argv.includes("--apply");

const SITES = {
  TS: {
    token: process.env.WORDPRESS_TS_ACCESS_TOKEN,
    blogId: process.env.WORDPRESS_TS_BLOG_ID,
  },
  WS: {
    token: process.env.WORDPRESS_WS_ACCESS_TOKEN,
    blogId: process.env.WORDPRESS_WS_BLOG_ID,
  },
};

for (const [site, cfg] of Object.entries(SITES)) {
  if (!cfg.token || !cfg.blogId) {
    console.error(`[FATAL] env missing for ${site}: WORDPRESS_${site}_ACCESS_TOKEN / WORDPRESS_${site}_BLOG_ID`);
    process.exit(1);
  }
}

function disclaimerBlock(contextPhrase) {
  return `<div style="margin-top:32px;padding:16px 20px;background:#F5F5F5;border-left:3px solid #999;border-radius:4px;font-size:14px;color:#555;line-height:1.7;"><p style="margin:0 0 8px 0;font-weight:600;color:#1A1A1A;">⚠️ 면책 고지</p><p style="margin:0;">본 글은 정보 제공을 목적으로 작성되었으며, 의료·법률·세무·투자 조언을 구성하지 않습니다. ${contextPhrase} 의사·약사·전문가와 반드시 상담하시기 바랍니다. 정책·치료법·제품 정보는 변경될 수 있으므로 최신 정보를 직접 확인하시기 바랍니다.</p></div>`;
}

function appendDisclaimer(content, contextText) {
  if (content.includes("⚠️ 면책 고지")) {
    return { content, changed: false, reason: "already has disclaimer" };
  }
  const lastDivIdx = content.lastIndexOf("</div>");
  if (lastDivIdx < 0) return { content, changed: false, reason: "no outer </div> found" };
  const newContent = content.slice(0, lastDivIdx) + disclaimerBlock(contextText) + content.slice(lastDivIdx);
  return { content: newContent, changed: true, reason: "appended disclaimer" };
}

const TARGETS = [
  {
    site: "WS",
    id: 349,
    label: "[57] 근력운동 주 2회",
    transforms: [
      (c) => appendDisclaimer(c, "운동 강도·빈도 결정 및 부상·기저질환 우려 시"),
    ],
  },
];

async function getPost(site, postId) {
  const cfg = SITES[site];
  const res = await fetch(
    `https://public-api.wordpress.com/rest/v1.1/sites/${cfg.blogId}/posts/${postId}?context=edit`,
    { headers: { Authorization: `Bearer ${cfg.token}` } }
  );
  if (!res.ok) throw new Error(`get ${site}/${postId} fail: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function updatePost(site, postId, content) {
  const cfg = SITES[site];
  const res = await fetch(
    `https://public-api.wordpress.com/rest/v1.1/sites/${cfg.blogId}/posts/${postId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(`update ${site}/${postId} fail: ${res.status} ${await res.text()}`);
  return await res.json();
}

(async () => {
  console.log(`[mode] ${APPLY ? "APPLY (실제 POST)" : "DRY-RUN"}`);

  const summary = [];
  for (const target of TARGETS) {
    console.log(`\n[plan] ${target.label} (${target.site}/${target.id})`);
    const post = await getPost(target.site, target.id);
    let content = post.content;
    const beforeLen = content.length;
    const ops = [];
    for (const fn of target.transforms) {
      const result = fn(content);
      content = result.content;
      ops.push(`${result.changed ? "✓" : "·"} ${result.reason}`);
    }
    const afterLen = content.length;
    console.log(`       ops: ${ops.join(" | ")}`);
    console.log(`       length: ${beforeLen} → ${afterLen} (${afterLen - beforeLen >= 0 ? "+" : ""}${afterLen - beforeLen})`);

    const anyChanged = ops.some((op) => op.startsWith("✓"));
    if (!anyChanged) {
      console.log(`       SKIP — no changes`);
      summary.push({ site: target.site, id: target.id, label: target.label, status: "SKIP" });
      continue;
    }

    if (!APPLY) {
      console.log(`       --- last 500 chars after patch ---`);
      console.log(`       ${content.slice(-500).replace(/\n/g, " ")}`);
      summary.push({ site: target.site, id: target.id, label: target.label, status: "DRY", delta: afterLen - beforeLen });
      continue;
    }

    try {
      await updatePost(target.site, target.id, content);
      console.log(`       ✓ POST 성공`);
      summary.push({ site: target.site, id: target.id, label: target.label, status: "OK", delta: afterLen - beforeLen });
    } catch (e) {
      console.error(`       ✗ POST 실패: ${e.message}`);
      summary.push({ site: target.site, id: target.id, label: target.label, status: "FAIL", error: e.message });
    }
  }

  console.log(`\n[summary]`);
  console.table(summary);
  if (!APPLY) console.log(`\n→ 적용하려면: --apply 추가`);
})().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
