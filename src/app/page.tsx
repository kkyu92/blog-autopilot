"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ContentRow = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
};

interface GoogleTrend {
  keyword: string;
  trafficVolume: string;
  newsTitle: string;
  newsSource: string;
}

interface DomesticIssue {
  keyword: string;
  rank: number;
  summary: string;
}

interface PerformanceData {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    position: number;
  }>;
}

function PerformanceWidget() {
  const { data: settings } = useQuery<{
    connections: { blogger: string };
    settings: Record<string, string>;
  }>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const siteUrl = settings?.settings?.search_console_site;
  const isConnected = settings?.connections?.blogger === "connected";

  const { data: performance, isLoading } = useQuery<PerformanceData>({
    queryKey: ["analytics", siteUrl],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics?siteUrl=${encodeURIComponent(siteUrl!)}&action=summary&days=28`
      );
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!siteUrl && isConnected,
    refetchInterval: 30 * 60 * 1000, // 30분
  });

  if (!isConnected || !siteUrl) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">검색 성과</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {!isConnected
              ? "Google 계정을 연결하고 설정에서 Search Console 사이트를 지정하세요."
              : "설정에서 search_console_site를 지정하세요."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">검색 성과 (28일)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!performance) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">검색 성과 (최근 28일)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 요약 지표 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">클릭</p>
            <p className="text-xl font-bold">
              {performance.totalClicks.toLocaleString()}
            </p>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">노출</p>
            <p className="text-xl font-bold">
              {performance.totalImpressions.toLocaleString()}
            </p>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">평균 CTR</p>
            <p className="text-xl font-bold">
              {(performance.avgCtr * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">평균 순위</p>
            <p className="text-xl font-bold">
              {performance.avgPosition.toFixed(1)}
            </p>
          </div>
        </div>

        {/* 상위 검색어 */}
        {performance.topQueries?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              상위 검색어
            </p>
            <div className="space-y-1">
              {performance.topQueries.slice(0, 5).map((q, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm p-1.5 rounded hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">
                      {i + 1}
                    </span>
                    <span className="truncate">{q.query}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{q.clicks}클릭</span>
                    <span>#{q.position.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const router = useRouter();

  const { data: allPosts = [] } = useQuery<ContentRow[]>({
    queryKey: ["contents", ""],
    queryFn: async () => {
      const res = await fetch("/api/content");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Google 트렌드 TOP 5
  const { data: googleTrends, isLoading: googleLoading } = useQuery<{
    keywords: GoogleTrend[];
  }>({
    queryKey: ["google-trending"],
    queryFn: async () => {
      const res = await fetch("/api/keywords/trending");
      if (!res.ok) throw new Error();
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // 국내 이슈 TOP 5
  const { data: domesticIssues, isLoading: domesticLoading } = useQuery<{
    keywords: DomesticIssue[];
  }>({
    queryKey: ["domestic-issues"],
    queryFn: async () => {
      const res = await fetch("/api/keywords/naver-trending");
      if (!res.ok) throw new Error();
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // 키워드로 바로 글 생성
  const createMutation = useMutation({
    mutationFn: async (keyword: string) => {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: keyword }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: (data, keyword) => {
      router.push(`/editor/${data.id}?keyword=${encodeURIComponent(keyword)}`);
    },
  });

  const drafts = allPosts.filter((p) => p.status === "draft");
  const published = allPosts.filter((p) => p.status === "published");
  const failed = allPosts.filter((p) => p.status === "failed");

  const TrendSkeleton = () => (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">대시보드</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              초안
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{drafts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              발행 완료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{published.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              실패
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{failed.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* 트렌드 키워드 — Google + 국내 이슈 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Google 트렌드 TOP 5 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              Google 인기 검색어
              <Link href="/topics">
                <Button variant="ghost" size="sm" className="text-xs">
                  더보기
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {googleLoading ? (
              <TrendSkeleton />
            ) : googleTrends?.keywords?.length ? (
              <div className="space-y-1">
                {googleTrends.keywords.slice(0, 5).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground font-mono w-4">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {item.keyword}
                      </span>
                      {item.trafficVolume && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {item.trafficVolume}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs"
                      onClick={() => createMutation.mutate(item.keyword)}
                      disabled={createMutation.isPending}
                    >
                      글 생성
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                트렌드를 불러오지 못했습니다.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 국내 이슈 TOP 5 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              국내 실시간 이슈
              <Link href="/topics">
                <Button variant="ghost" size="sm" className="text-xs">
                  더보기
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {domesticLoading ? (
              <TrendSkeleton />
            ) : domesticIssues?.keywords?.length ? (
              <div className="space-y-1">
                {domesticIssues.keywords.slice(0, 5).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground font-mono w-4">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {item.keyword}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-xs"
                      onClick={() => createMutation.mutate(item.keyword)}
                      disabled={createMutation.isPending}
                    >
                      글 생성
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                이슈를 불러오지 못했습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Search Console 성과 */}
      <PerformanceWidget />

      {/* Recent drafts */}
      <Card>
        <CardHeader>
          <CardTitle>최근 초안</CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              아직 작성한 글이 없습니다.{" "}
              <Link href="/topics" className="text-primary underline">
                새 글 작성
              </Link>
              으로 시작하세요.
            </p>
          ) : (
            <div className="space-y-2">
              {drafts.slice(0, 5).map((post) => (
                <Link
                  key={post.id}
                  href={`/editor/${post.id}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <span className="font-medium text-sm">
                    {post.title || "(제목 없음)"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.updatedAt).toLocaleDateString("ko-KR")}
                  </span>
                </Link>
              ))}
              {drafts.length > 5 && (
                <Link href="/posts?status=draft">
                  <Button variant="ghost" size="sm" className="w-full">
                    모두 보기 ({drafts.length}개)
                  </Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
