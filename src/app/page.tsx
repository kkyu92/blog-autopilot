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
