// GSC URL Inspection — diagnose 색인 0/158 root cause
// Usage: node --env-file=.env.local scripts/mid-review/inspect.mjs

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_BLOG_ID } = process.env;

async function refreshAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: GOOGLE_REFRESH_TOKEN,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function getBloggerPostUrls(accessToken, n = 3) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${GOOGLE_BLOG_ID}/posts?maxResults=${n}&fetchBodies=false&status=live`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  return (data.items || []).map(p => ({ title: p.title, url: p.url, published: p.published }));
}

async function inspectUrl(accessToken, siteUrl, inspectionUrl) {
  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "ko" }),
  });
  if (!res.ok) return { error: `${res.status} ${await res.text()}` };
  return res.json();
}

async function main() {
  const accessToken = await refreshAccessToken();
  const siteUrl = "https://apt-signal.blogspot.com/";

  // Inspect homepage + 2 latest posts
  const targets = [{ title: "homepage", url: siteUrl, published: null }];
  const posts = await getBloggerPostUrls(accessToken, 2);
  targets.push(...posts);

  const result = { siteUrl, generated_at: new Date().toISOString(), inspections: [] };

  for (const target of targets) {
    const r = await inspectUrl(accessToken, siteUrl, target.url);
    const status = r.inspectionResult?.indexStatusResult || {};
    result.inspections.push({
      title: target.title,
      url: target.url,
      published: target.published,
      verdict: status.verdict,
      coverageState: status.coverageState,
      robotsTxtState: status.robotsTxtState,
      indexingState: status.indexingState,
      pageFetchState: status.pageFetchState,
      crawledAs: status.crawledAs,
      lastCrawlTime: status.lastCrawlTime,
      googleCanonical: status.googleCanonical,
      userCanonical: status.userCanonical,
      sitemap: status.sitemap,
      referringUrls: status.referringUrls?.slice(0, 3),
      raw_error: r.error,
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
