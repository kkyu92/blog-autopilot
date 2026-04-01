"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface TrendingKeyword {
  keyword: string;
  trafficVolume: string;
  relatedQueries: string[];
}

export default function TopicsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  // 실시간 트렌드 자동 로드
  const {
    data: trendData,
    isLoading: trendLoading,
    error: trendError,
  } = useQuery<{
    keywords: TrendingKeyword[];
    cached: boolean;
    cachedAt: string;
    stale?: boolean;
  }>({
    queryKey: ["trending"],
    queryFn: async () => {
      const res = await fetch("/api/keywords/trending");
      if (!res.ok) throw new Error("트렌드 조회 실패");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000, // 5분 자동 갱신
  });

  // 키워드 검색
  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`/api/keywords/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("검색 실패");
      return res.json();
    },
  });

  // "이 주제로 생성" — draft 생성 → 에디터로 이동
  const createMutation = useMutation({
    mutationFn: async (keyword: string) => {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: keyword }),
      });
      if (!res.ok) throw new Error("콘텐츠 생성 실패");
      return res.json();
    },
    onSuccess: (data, keyword) => {
      router.push(`/editor/${data.id}?keyword=${encodeURIComponent(keyword)}`);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery.trim());
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">키워드 탐색</h2>

      {/* 실시간 트렌드 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-lg font-semibold">지금 뜨는 키워드</h3>
          {trendData?.stale && (
            <Badge variant="outline">이전 데이터</Badge>
          )}
          {trendData?.cached && trendData.cachedAt && (
            <span className="text-xs text-muted-foreground">
              {Math.round(
                (Date.now() - new Date(trendData.cachedAt).getTime()) / 60000
              )}
              분 전
            </span>
          )}
        </div>

        {trendLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : trendError ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              실시간 트렌드를 가져오지 못했습니다. 아래에서 직접 검색하세요.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trendData?.keywords?.map((item, i) => (
              <Card key={i} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{item.keyword}</h4>
                    {item.trafficVolume && (
                      <Badge variant="secondary" className="text-xs">
                        {item.trafficVolume}
                      </Badge>
                    )}
                  </div>
                  {item.relatedQueries.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.relatedQueries.map((q, j) => (
                        <Badge key={j} variant="outline" className="text-xs">
                          {q}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => createMutation.mutate(item.keyword)}
                    disabled={createMutation.isPending}
                  >
                    이 주제로 생성
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 수동 검색 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">키워드 검색</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="키워드를 입력하세요..."
              className="flex-1"
            />
            <Button type="submit" disabled={searchMutation.isPending}>
              {searchMutation.isPending ? "검색 중..." : "검색"}
            </Button>
          </form>

          {searchMutation.data && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">
                  &quot;{searchMutation.data.keyword}&quot; 검색 결과
                </h4>
                <Button
                  size="sm"
                  onClick={() =>
                    createMutation.mutate(searchMutation.data.keyword)
                  }
                >
                  이 주제로 생성
                </Button>
              </div>

              {searchMutation.data.relatedKeywords?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    관련 키워드
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {searchMutation.data.relatedKeywords.map(
                      (kw: string, i: number) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => {
                            setSearchQuery(kw);
                            searchMutation.mutate(kw);
                          }}
                        >
                          {kw}
                        </Badge>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {searchMutation.error && (
            <p className="mt-3 text-sm text-destructive">
              검색에 실패했습니다. 다시 시도해주세요.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
