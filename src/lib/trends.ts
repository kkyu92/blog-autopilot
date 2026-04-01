// google-trends-api has no types, use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require("google-trends-api");

export interface TrendingKeyword {
  keyword: string;
  trafficVolume: string;
  relatedQueries: string[];
}

// 한국 실시간 인기 검색어
export async function getDailyTrends(): Promise<TrendingKeyword[]> {
  const result = await googleTrends.dailyTrends({ geo: "KR" });
  const parsed = JSON.parse(result);

  const days =
    parsed?.default?.trendingSearchesDays || [];
  if (days.length === 0) return [];

  const searches = days[0]?.trendingSearches || [];
  return searches.slice(0, 20).map(
    (item: {
      title: { query: string };
      formattedTraffic: string;
      relatedQueries: { query: string }[];
    }) => ({
      keyword: item.title?.query || "",
      trafficVolume: item.formattedTraffic || "",
      relatedQueries: (item.relatedQueries || [])
        .slice(0, 5)
        .map((q: { query: string }) => q.query),
    })
  );
}

export interface InterestData {
  time: string;
  value: number;
}

// 키워드 트렌드 추이
export async function getInterestOverTime(
  keyword: string
): Promise<InterestData[]> {
  const result = await googleTrends.interestOverTime({
    keyword,
    geo: "KR",
  });
  const parsed = JSON.parse(result);
  const timeline = parsed?.default?.timelineData || [];

  return timeline.map((item: { formattedTime: string; value: number[] }) => ({
    time: item.formattedTime,
    value: item.value?.[0] || 0,
  }));
}

// 관련 검색어
export async function getRelatedQueries(
  keyword: string
): Promise<{ top: string[]; rising: string[] }> {
  const result = await googleTrends.relatedQueries({
    keyword,
    geo: "KR",
  });
  const parsed = JSON.parse(result);
  const data = parsed?.default;

  const top = (data?.rankedList?.[0]?.rankedKeyword || [])
    .slice(0, 10)
    .map((item: { query: string }) => item.query);
  const rising = (data?.rankedList?.[1]?.rankedKeyword || [])
    .slice(0, 10)
    .map((item: { query: string }) => item.query);

  return { top, rising };
}
