"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

type Publication = {
  platform: string;
  externalUrl: string | null;
  status: string;
};

type ContentRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  publications: Publication[];
};

const STATUS_TABS = [
  { value: "", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "published", label: "발행 완료" },
  { value: "failed", label: "실패" },
] as const;

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  published: "default",
  failed: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  published: "발행 완료",
  failed: "실패",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PostsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery<ContentRow[]>({
    queryKey: ["contents", statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/api/content?status=${statusFilter}`
        : "/api/content";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 콘텐츠</h1>
        <Link href="/topics">
          <Button size="sm">+ 새 글 작성</Button>
        </Link>
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 text-sm ${
              statusFilter === tab.value
                ? "border-b-2 border-primary font-medium"
                : "text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          불러오는 중...
        </div>
      ) : posts.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          아직 작성한 글이 없습니다.{" "}
          <Link href="/topics" className="text-primary underline">
            키워드를 선택하여 새 글을 작성해보세요.
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead className="w-[100px]">상태</TableHead>
              <TableHead className="w-[140px]">플랫폼</TableHead>
              <TableHead className="w-[120px]">생성일</TableHead>
              <TableHead className="w-[120px]">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell>
                  <Link
                    href={`/editor/${post.id}`}
                    className="hover:underline font-medium"
                  >
                    {post.title || "(제목 없음)"}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[post.status] || "secondary"}>
                    {STATUS_LABEL[post.status] || post.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {post.publications?.filter(p => p.status === "published").map((pub) => (
                      <a
                        key={pub.platform}
                        href={pub.externalUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block"
                      >
                        <Badge variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs">
                          {pub.platform === "blogger" ? "Blogger" : "WordPress"} ↗
                        </Badge>
                      </a>
                    ))}
                    {(!post.publications || post.publications.filter(p => p.status === "published").length === 0) && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(post.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Link href={`/editor/${post.id}`}>
                      <Button variant="ghost" size="sm">
                        편집
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("정말 삭제하시겠습니까?"))
                          deleteMutation.mutate(post.id);
                      }}
                    >
                      삭제
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
