// One-shot fetcher for mid-review 2026-04-28: GSC + Blogger pages
// Usage: node --env-file=.env.local scripts/mid-review/fetch.mjs

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GOOGLE_BLOG_ID,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_BLOG_ID) {
  console.error("Missing env: GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN/BLOG_ID");
  process.exit(1);
}

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
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function getBlog(accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${GOOGLE_BLOG_ID}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Blogger get blog failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listBloggerPages(accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${GOOGLE_BLOG_ID}/pages`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Blogger list pages failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listGscSites(accessToken) {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`GSC list sites failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function gscSearchAnalytics(accessToken, siteUrl, body) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GSC searchAnalytics failed (${siteUrl}): ${res.status} ${await res.text()}`);
  return res.json();
}

async function gscSitemaps(accessToken, siteUrl) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`GSC sitemaps failed (${siteUrl}): ${res.status} ${await res.text()}`);
  return res.json();
}

function pad(d) { return String(d).padStart(2, "0"); }
function toIsoDate(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }

async function main() {
  const accessToken = await refreshAccessToken();

  const blog = await getBlog(accessToken).catch(e => ({ error: e.message }));
  const blogUrl = blog?.url || null;

  const pages = await listBloggerPages(accessToken).catch(e => ({ error: e.message }));

  const sites = await listGscSites(accessToken).catch(e => ({ error: e.message }));

  // Snapshot anchored to spec (4/14 ~ 4/28). GSC has 2-3 day lag, so 4/28 may be partial.
  const startDate = "2026-04-14";
  const endDate = "2026-04-28";

  // Find matching GSC site for the blog
  let matchedSite = null;
  if (sites?.siteEntry && blogUrl) {
    const blogHost = new URL(blogUrl).hostname;
    matchedSite = sites.siteEntry.find(s => {
      const u = s.siteUrl || "";
      return u.includes(blogHost) || u.includes(`sc-domain:${blogHost}`);
    });
  }

  const result = {
    snapshot: { startDate, endDate, generated_at: new Date().toISOString() },
    blog: { id: GOOGLE_BLOG_ID, url: blogUrl, name: blog?.name, posts_count_in_blogger: blog?.posts?.totalItems, pages_count_in_blogger: blog?.pages?.totalItems },
    pages: pages?.items ? pages.items.map(p => ({ title: p.title, url: p.url, status: p.status, published: p.published })) : pages,
    gsc_sites_registered: sites?.siteEntry ? sites.siteEntry.map(s => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel })) : sites,
    matched_site: matchedSite,
  };

  // Collect GSC data for all 3 publishing channels (AS + WS + TS)
  const channelSites = [
    { channel: "AS_blogger", siteUrl: "https://apt-signal.blogspot.com/" },
    { channel: "WS_wordpress", siteUrl: "https://worldsignalblog.wordpress.com/" },
    { channel: "TS_wordpress", siteUrl: "https://travelsignalblog.wordpress.com/" },
  ];

  result.gsc_per_channel = {};
  for (const { channel, siteUrl } of channelSites) {
    const totals = await gscSearchAnalytics(accessToken, siteUrl, {
      startDate, endDate, dimensions: [], rowLimit: 1,
    }).catch(e => ({ error: e.message }));

    const topQueries = await gscSearchAnalytics(accessToken, siteUrl, {
      startDate, endDate, dimensions: ["query"], rowLimit: 5,
    }).catch(e => ({ error: e.message }));

    const topPages = await gscSearchAnalytics(accessToken, siteUrl, {
      startDate, endDate, dimensions: ["page"], rowLimit: 10,
    }).catch(e => ({ error: e.message }));

    const sitemaps = await gscSitemaps(accessToken, siteUrl).catch(e => ({ error: e.message }));

    result.gsc_per_channel[channel] = { siteUrl, totals, topQueries, topPages, sitemaps };
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
