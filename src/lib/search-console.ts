// Google Search Console API 연동

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsResponse {
  rows: SearchAnalyticsRow[];
  responseAggregationType?: string;
}

export interface PerformanceSummary {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  topPages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

// Search Console API 호출
export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  options: {
    startDate: string; // YYYY-MM-DD
    endDate: string;
    dimensions?: string[];
    rowLimit?: number;
  }
): Promise<SearchAnalyticsRow[]> {
  const { startDate, endDate, dimensions = ["query"], rowLimit = 25 } = options;

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Search Console API failed (${res.status}): ${err}`);
  }

  const data: SearchAnalyticsResponse = await res.json();
  return data.rows || [];
}

// 성과 요약 생성
export async function getPerformanceSummary(
  accessToken: string,
  siteUrl: string,
  days: number = 28
): Promise<PerformanceSummary> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const [queryRows, pageRows] = await Promise.all([
    querySearchAnalytics(accessToken, siteUrl, {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: ["query"],
      rowLimit: 10,
    }),
    querySearchAnalytics(accessToken, siteUrl, {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: ["page"],
      rowLimit: 10,
    }),
  ]);

  // 전체 합산
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalPosition = 0;

  for (const row of queryRows) {
    totalClicks += row.clicks;
    totalImpressions += row.impressions;
    totalPosition += row.position * row.impressions;
  }

  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition = totalImpressions > 0 ? totalPosition / totalImpressions : 0;

  return {
    totalClicks,
    totalImpressions,
    avgCtr,
    avgPosition,
    topQueries: queryRows.map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
    topPages: pageRows.map((r) => ({
      page: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
  };
}

// 사이트 목록 조회
export async function listSites(
  accessToken: string
): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const res = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) throw new Error(`Sites list failed: ${res.status}`);
  const data = await res.json();

  return (data.siteEntry || []).map(
    (entry: { siteUrl: string; permissionLevel: string }) => ({
      siteUrl: entry.siteUrl,
      permissionLevel: entry.permissionLevel,
    })
  );
}
