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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ContentRow | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/content/${id}`, { method: "DELETE" }))
      );
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed}건 삭제 실패`);
    },
    onSuccess: () => {
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["contents"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/content/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contents"] });
      alert(`싱크 완료: 새로 가져온 글 ${data.total.newlySynced}개, 기존 ${data.total.alreadyExisting}개`);
    },
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map(p => p.id)));
    }
  };

  const selectedPosts = posts.filter(p => selected.has(p.id));
  const selectedPublishedCount = selectedPosts.filter(
    p => p.publications?.some(pub => pub.status === "published")
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 콘텐츠</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? "싱크 중..." : "플랫폼 싱크"}
          </Button>
          <Link href="/topics">
            <Button size="sm">+ 새 글 작성</Button>
          </Link>
        </div>
      </div>

      {/* 선택 액션 바 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-muted/50 border rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size}개 선택</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkDeleteConfirm(true)}
          >
            선택 삭제
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            선택 해제
          </Button>
        </div>
      )}

      {/* 상태 필터 탭 */}
      <div className="flex gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value);
              setSelected(new Set());
            }}
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
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  checked={posts.length > 0 && selected.size === posts.length}
                  onChange={toggleAll}
                  className="rounded cursor-pointer"
                />
              </TableHead>
              <TableHead>제목</TableHead>
              <TableHead className="w-[100px]">상태</TableHead>
              <TableHead className="w-[140px]">플랫폼</TableHead>
              <TableHead className="w-[100px]">생성일</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow
                key={post.id}
                className={selected.has(post.id) ? "bg-muted/30" : ""}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(post.id)}
                    onChange={() => toggleSelect(post.id)}
                    className="rounded cursor-pointer"
                  />
                </TableCell>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteTarget(post)}
                  >
                    삭제
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* 개별 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 space-y-4 shadow-lg">
            <h3 className="font-bold text-lg">콘텐츠 삭제</h3>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{deleteTarget.title}</span>
              을(를) 삭제하시겠습니까?
            </p>
            {deleteTarget.publications?.filter(p => p.status === "published").length > 0 && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                다음 플랫폼에서도 함께 삭제됩니다:
                <ul className="mt-1 list-disc list-inside">
                  {deleteTarget.publications.filter(p => p.status === "published").map((pub) => (
                    <li key={pub.platform}>
                      {pub.platform === "blogger" ? "Google Blogger" : "WordPress"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                취소
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }}
              >
                {deleteMutation.isPending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 삭제 확인 모달 */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 space-y-4 shadow-lg">
            <h3 className="font-bold text-lg">일괄 삭제</h3>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selected.size}개</span> 콘텐츠를 삭제하시겠습니까?
            </p>
            {selectedPublishedCount > 0 && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {selectedPublishedCount}개 글이 외부 플랫폼(Blogger/WordPress)에서도 함께 삭제됩니다.
              </div>
            )}
            <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-1">
              {selectedPosts.map(p => (
                <div key={p.id} className="truncate">
                  {p.title || "(제목 없음)"}
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setBulkDeleteConfirm(false)}>
                취소
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => bulkDeleteMutation.mutate([...selected])}
              >
                {bulkDeleteMutation.isPending ? `삭제 중... (${selected.size}건)` : `${selected.size}개 삭제`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
