"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ContentRow = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
};

export default function Dashboard() {
  const { data: allPosts = [] } = useQuery<ContentRow[]>({
    queryKey: ["contents", ""],
    queryFn: async () => {
      const res = await fetch("/api/content");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const drafts = allPosts.filter((p) => p.status === "draft");
  const published = allPosts.filter((p) => p.status === "published");
  const failed = allPosts.filter((p) => p.status === "failed");

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

      {/* Trending keywords placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            지금 뜨는 키워드
            <Badge variant="secondary">Phase 4</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Phase 4에서 Google Trends 연동 후 활성화됩니다.
          </p>
        </CardContent>
      </Card>

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
