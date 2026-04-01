"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

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
  question: string;
  newsTitle: string;
  newsUrl: string;
}

export default function TopicsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [bulkTone, setBulkTone] = useState("informative");

  // Google 실시간 트렌드
  const {
    data: googleData,
    isLoading: googleLoading,
    error: googleError,
  } = useQuery<{
    keywords: GoogleTrend[];
    cached: boolean;
    cachedAt: string;
    stale?: boolean;
  }>({
    queryKey: ["google-trending"],
    queryFn: async () => {
      const res = await fetch("/api/keywords/trending");
      if (!res.ok) throw new Error("트렌드 조회 실패");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // 국내 이슈 키워드
  const {
    data: domesticData,
    isLoading: domesticLoading,
    error: domesticError,
  } = useQuery<{
    keywords: DomesticIssue[];
    cached: boolean;
    cachedAt: string;
    stale?: boolean;
  }>({
    queryKey: ["domestic-issues"],
    queryFn: async () => {
      const res = await fetch("/api/keywords/naver-trending");
      if (!res.ok) throw new Error("국내 이슈 조회 실패");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // 키워드 검색 → Google + Naver 연관 키워드
  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(
        `/api/keywords/search?q=${encodeURIComponent(q)}`
      );
      if (!res.ok) throw new Error("검색 실패");
      return res.json();
    },
  });

  // 벌크 생성
  const bulkMutation = useMutation({
    mutationFn: async (keywords: string[]) => {
      const res = await fetch("/api/content/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, tone: bulkTone }),
      });
      if (!res.ok) throw new Error("벌크 생성 실패");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`${data.success}개 생성 완료, ${data.failed}개 실패`);
      setSelectedKeywords(new Set());
      router.push("/posts");
    },
    onError: () => {
      toast.error("벌크 생성에 실패했습니다");
    },
  });

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else if (next.size < 10) next.add(keyword);
      else toast.error("최대 10개까지 선택 가능합니다");
      return next;
    });
  };

  // draft 생성 → 에디터 이동
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
    onError: () => {
      toast.error("콘텐츠 생성에 실패했습니다. 다시 시도해주세요.");
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery.trim());
    }
  };

  const handleKeywordClick = (keyword: string) => {
    setSearchQuery(keyword);
    searchMutation.mutate(keyword);
  };

  const CacheInfo = ({
    data,
  }: {
    data?: { stale?: boolean; cached: boolean; cachedAt: string };
  }) => {
    if (!data) return null;
    return (
      <span className="flex items-center gap-1">
        {data.stale && <Badge variant="outline">이전 데이터</Badge>}
        {data.cached && data.cachedAt && (
          <span className="text-xs text-muted-foreground">
            {Math.round(
              (Date.now() - new Date(data.cachedAt).getTime()) / 60000
            )}
            분 전
          </span>
        )}
      </span>
    );
  };

  const LoadingSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-3 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const ErrorCard = ({ message }: { message: string }) => (
    <Card>
      <CardContent className="p-4 text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">키워드 탐색</h2>

      {/* 키워드 검색 */}
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
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-lg">
                  &quot;{searchMutation.data.keyword}&quot;
                </h4>
                <Button
                  size="sm"
                  onClick={() =>
                    createMutation.mutate(searchMutation.data.keyword)
                  }
                  disabled={createMutation.isPending}
                >
                  이 주제로 생성
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Google 연관 */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Google 연관 키워드
                  </p>
                  {searchMutation.data.google?.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {searchMutation.data.google.map(
                        (kw: string, i: number) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-1"
                            onClick={() => handleKeywordClick(kw)}
                          >
                            {kw}
                          </Badge>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">결과 없음</p>
                  )}
                </div>

                {/* Naver 연관 */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Naver 연관 키워드
                  </p>
                  {searchMutation.data.naver?.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {searchMutation.data.naver.map(
                        (kw: string, i: number) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-1 border-green-500/50"
                            onClick={() => handleKeywordClick(kw)}
                          >
                            {kw}
                          </Badge>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">결과 없음</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {searchMutation.error && (
            <p className="mt-3 text-sm text-destructive">
              검색에 실패했습니다. 다시 시도해주세요.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 벌크 선택 액션 바 */}
      {selectedKeywords.size > 0 && (
        <div className="sticky top-0 z-10 bg-background border rounded-md p-3 flex items-center gap-3 flex-wrap shadow-sm">
          <Badge variant="default">{selectedKeywords.size}개 선택됨</Badge>
          <div className="flex flex-wrap gap-1">
            {[...selectedKeywords].map((kw) => (
              <Badge
                key={kw}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => toggleKeyword(kw)}
              >
                {kw} &times;
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={bulkTone}
              onChange={(e) => setBulkTone(e.target.value)}
              className="text-sm border rounded px-2 py-1 bg-background"
            >
              <option value="informative">정보 전달형</option>
              <option value="conversational">대화체</option>
              <option value="expert">전문가</option>
            </select>
            <Button
              size="sm"
              onClick={() => bulkMutation.mutate([...selectedKeywords])}
              disabled={bulkMutation.isPending}
            >
              {bulkMutation.isPending
                ? `생성 중... (${selectedKeywords.size}개)`
                : `일괄 생성 (${selectedKeywords.size}개)`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedKeywords(new Set())}
            >
              초기화
            </Button>
          </div>
        </div>
      )}

      {/* 실시간 트렌드 탭 */}
      <Tabs defaultValue="google">
        <div className="flex items-center gap-3 mb-1">
          <TabsList>
            <TabsTrigger value="google">Google 트렌드</TabsTrigger>
            <TabsTrigger value="domestic">국내 이슈</TabsTrigger>
          </TabsList>
        </div>

        {/* Google 트렌드 */}
        <TabsContent value="google" className="mt-3">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-semibold">실시간 인기 검색어</h3>
            <CacheInfo data={googleData} />
          </div>

          {googleLoading ? (
            <LoadingSkeleton />
          ) : googleError ? (
            <ErrorCard message="Google 트렌드를 가져오지 못했습니다." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {googleData?.keywords?.map((item, i) => (
                <Card
                  key={i}
                  className={`hover:border-primary/50 transition-colors ${selectedKeywords.has(item.keyword) ? "border-primary bg-primary/5" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedKeywords.has(item.keyword)}
                          onChange={() => toggleKeyword(item.keyword)}
                          className="rounded"
                        />
                        <span className="text-xs text-muted-foreground font-mono w-5">
                          {i + 1}
                        </span>
                        <h4
                          className="font-medium cursor-pointer hover:text-primary transition-colors"
                          onClick={() => handleKeywordClick(item.keyword)}
                        >
                          {item.keyword}
                        </h4>
                      </div>
                      {item.trafficVolume && (
                        <Badge
                          variant="secondary"
                          className="text-xs shrink-0"
                        >
                          {item.trafficVolume}
                        </Badge>
                      )}
                    </div>

                    {item.newsTitle && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {item.newsSource && (
                          <span className="font-medium">
                            [{item.newsSource}]
                          </span>
                        )}{" "}
                        {item.newsTitle}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleKeywordClick(item.keyword)}
                      >
                        연관 검색
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => createMutation.mutate(item.keyword)}
                        disabled={createMutation.isPending}
                      >
                        글 생성
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 국내 이슈 */}
        <TabsContent value="domestic" className="mt-3">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-semibold">실시간 국내 이슈</h3>
            <CacheInfo data={domesticData} />
          </div>

          {domesticLoading ? (
            <LoadingSkeleton />
          ) : domesticError ? (
            <ErrorCard message="국내 이슈를 가져오지 못했습니다." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {domesticData?.keywords?.map((item, i) => (
                <Card
                  key={i}
                  className={`hover:border-green-500/30 transition-colors ${selectedKeywords.has(item.keyword) ? "border-green-500 bg-green-500/5" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedKeywords.has(item.keyword)}
                        onChange={() => toggleKeyword(item.keyword)}
                        className="rounded"
                      />
                      <span className="text-xs text-muted-foreground font-mono w-5">
                        {item.rank}
                      </span>
                      <h4
                        className="font-medium cursor-pointer hover:text-green-600 transition-colors"
                        onClick={() => handleKeywordClick(item.keyword)}
                      >
                        {item.keyword}
                      </h4>
                    </div>

                    {item.summary && (
                      <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                        {item.summary}
                      </p>
                    )}

                    {item.newsTitle && (
                      <p className="text-xs text-blue-500/80 mb-2 line-clamp-1">
                        {item.newsTitle}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleKeywordClick(item.keyword)}
                      >
                        연관 검색
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => createMutation.mutate(item.keyword)}
                        disabled={createMutation.isPending}
                      >
                        글 생성
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
