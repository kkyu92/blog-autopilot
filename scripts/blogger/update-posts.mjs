#!/usr/bin/env node
// Blogger Posts 본문 patch 도구.
//
// 4/30 AS 17건 spot-check 결과 P0 fix:
//   - [52] 환각 도메인 (www.appear.go.kr) 제거 → law.go.kr (국가법령정보센터)
//   - [7] [8] [52] YMYL disclaimer 추가 (면책 고지)
//
// 5/1 9건 spot-check (자연 cron 7건 + 보충 dispatch 2건) P0 fix:
//   - [58] [63] YMYL disclaimer 추가 (wangsuk2 청약, 양도세 보충)
//   (4/30 TARGETS는 idempotent — already has disclaimer로 SKIP 됨)
//
// 5/2 8건 spot-check P0 fix:
//   - [68] YMYL disclaimer 추가 (5월 부동산 세금 납부 기한)
//
// 5/3 + 5/4 spot-check P0 fix:
//   - [78] 깡통전세 (5/3 LIVE, "면책" 단어 없는 약식 disclaimer만 — 표준 박스 추가)
//   - [85] [88] (5/4 SCHEDULED): SCHEDULED URL hit 시 placeholder HTML로 false-positive 진단됨.
//     ADMIN view 재확인 결과 본문에 "※ 면책 고지" / "⚖️ 면책고지" 정상 포함 → patch 불필요.
//   → L1 fallback (editor.ts) + L2 (content-writer.md) fix와 함께 적용
//
// 사용:
//   node --env-file=.env.local scripts/blogger/update-posts.mjs           # dry-run
//   node --env-file=.env.local scripts/blogger/update-posts.mjs --apply   # 실제 PUT

const APPLY = process.argv.includes("--apply");

const BLOG_ID = process.env.GOOGLE_BLOG_ID;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!BLOG_ID || !REFRESH_TOKEN || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("[FATAL] env missing: GOOGLE_BLOG_ID / GOOGLE_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
  process.exit(1);
}

function disclaimerBlock(contextPhrase) {
  // contextPhrase는 시간 부사구 형태 ("...시", "...전" 등)로 받아 자연스러운 한국어 만든다.
  return `<div style="margin-top:32px;padding:16px 20px;background:#F5F5F5;border-left:3px solid #999;border-radius:4px;font-size:14px;color:#555;line-height:1.7;"><p style="margin:0 0 8px 0;font-weight:600;color:#1A1A1A;">⚠️ 면책 고지</p><p style="margin:0;">본 글은 정보 제공을 목적으로 작성되었으며, 법률·세무·투자 조언을 구성하지 않습니다. ${contextPhrase} 공인 세무사·법무사·공인중개사 등 전문가와 반드시 상담하시기 바랍니다. 정책·법안 내용은 변경될 수 있으므로 최신 정보를 직접 확인하시기 바랍니다.</p></div>`;
}

// Outer wrapper 닫기 직전(마지막 </div>)에 disclaimer 삽입
function appendDisclaimer(content, contextText) {
  if (content.includes("⚠️ 면책 고지")) {
    return { content, changed: false, reason: "already has disclaimer" };
  }
  // 마지막 </div> 앞에 삽입
  const lastDivIdx = content.lastIndexOf("</div>");
  if (lastDivIdx < 0) return { content, changed: false, reason: "no outer </div> found" };
  const newContent = content.slice(0, lastDivIdx) + disclaimerBlock(contextText) + content.slice(lastDivIdx);
  return { content: newContent, changed: true, reason: "appended disclaimer" };
}

// [52] appear.go.kr → law.go.kr 교체 (한 문장 단위)
function fixAppearDomain(content) {
  const before = "행정안전부 인구감소지역 지원 포털(www.appear.go.kr)에서 시·군 단위로 지정 여부를 확인할 수 있습니다.";
  const after = "행정안전부 고시 및 국가법령정보센터(law.go.kr)에서 시·군 단위로 지정 여부를 확인할 수 있습니다.";
  if (!content.includes(before)) {
    return { content, changed: false, reason: "appear.go.kr sentence not matched" };
  }
  return { content: content.replace(before, after), changed: true, reason: "appear.go.kr → law.go.kr" };
}

// IDs: string literal 필수 (Number 정밀도 한계로 19-digit ID truncate됨)
const TARGETS = [
  {
    id: "5671874995976343669",
    label: "[7] 2026년 청약 1순위 조건",
    transforms: [
      (c) => appendDisclaimer(c, "청약 신청 및 분양 결정 시"),
    ],
  },
  {
    id: "4899486805792732266",
    label: "[8] 2026 봄 이사철 전세 vs 매매",
    transforms: [
      (c) => appendDisclaimer(c, "매매·전세 등 부동산 거래 결정 시"),
    ],
  },
  {
    id: "5388136909337383329",
    label: "[52] 인구감소지역 양도세·종부세 특례",
    transforms: [
      fixAppearDomain,
      (c) => appendDisclaimer(c, "세제 적용 및 세무 신고 시"),
    ],
  },
  // 5/1 spot-check 추가
  {
    id: "5733257609327216635",
    label: "[58] 왕숙2 공공분양 청약 2026년 5월",
    transforms: [
      (c) => appendDisclaimer(c, "청약 신청 및 분양 결정 시"),
    ],
  },
  {
    id: "6868336670304012905",
    label: "[63] 다주택자 양도세 중과 재시행 2026 5월 9일 (보충 dispatch)",
    transforms: [
      (c) => appendDisclaimer(c, "세제 적용 및 매매·보유 결정 시"),
    ],
  },
  // 5/2 spot-check 추가
  {
    id: "5298712751757772280",
    label: "[68] 2026년 5월 부동산 세금 납부 기한 총정리",
    transforms: [
      (c) => appendDisclaimer(c, "세제 적용 및 세무 신고 시"),
    ],
  },
  // 5/3 spot-check 추가 (78만 — 85/88은 SCHEDULED false-positive로 제외)
  {
    id: "6900341062530552701",
    label: "[78] 깡통전세 위험 사전 체크법 2026",
    transforms: [
      (c) => appendDisclaimer(c, "전세 계약 및 매매 결정 시"),
    ],
  },
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
  if (!res.ok) throw new Error(`token refresh fail: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getPost(token, postId) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`get post ${postId} fail: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function updatePost(token, postId, title, content) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "blogger#post",
        id: postId,
        title,
        content,
      }),
    }
  );
  if (!res.ok) throw new Error(`update post ${postId} fail: ${res.status} ${await res.text()}`);
  return await res.json();
}

(async () => {
  console.log(`[mode] ${APPLY ? "APPLY (실제 PUT)" : "DRY-RUN"}`);
  const token = await getAccessToken();
  console.log("[auth] token 획득");

  const summary = [];
  for (const target of TARGETS) {
    console.log(`\n[plan] ${target.label} (id=${target.id})`);
    const post = await getPost(token, target.id);
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
      summary.push({ id: target.id, label: target.label, status: "SKIP" });
      continue;
    }

    if (!APPLY) {
      // dry-run: 변경 후 마지막 600자만 미리보기
      console.log(`       --- last 500 chars after patch ---`);
      console.log(`       ${content.slice(-500).replace(/\n/g, " ")}`);
      summary.push({ id: target.id, label: target.label, status: "DRY", delta: afterLen - beforeLen });
      continue;
    }

    try {
      await updatePost(token, target.id, post.title, content);
      console.log(`       ✓ PUT 성공`);
      summary.push({ id: target.id, label: target.label, status: "OK", delta: afterLen - beforeLen });
    } catch (e) {
      console.error(`       ✗ PUT 실패: ${e.message}`);
      summary.push({ id: target.id, label: target.label, status: "FAIL", error: e.message });
    }
  }

  console.log(`\n[summary]`);
  console.table(summary);
  if (!APPLY) console.log(`\n→ 적용하려면: --apply 추가`);
})().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
