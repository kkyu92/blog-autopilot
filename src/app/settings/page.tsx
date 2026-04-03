"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [claudeKey, setClaudeKey] = useState("");
  const [defaultTone, setDefaultTone] = useState("informative");
  const [searchConsoleSite, setSearchConsoleSite] = useState("");
  const [notification, setNotification] = useState<string | null>(() => {
    const blogger = searchParams.get("blogger");
    const wordpress = searchParams.get("wordpress");
    const error = searchParams.get("error");
    if (blogger === "connected") return "Blogger 연결 완료!";
    if (wordpress === "connected") return "WordPress 연결 완료!";
    if (error) return `오류: ${error}`;
    return null;
  });

  const { data } = useQuery<{
    settings: Record<string, string>;
    connections: { blogger: string; wordpress: string };
  }>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 데이터로 폼 초기화
      if (data.settings.default_tone) setDefaultTone(data.settings.default_tone);
      if (data.settings.search_console_site) setSearchConsoleSite(data.settings.search_console_site);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setNotification("설정 저장됨");
      setTimeout(() => setNotification(null), 3000);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [`${platform}_tokens`]: "" }),
      });
      if (!res.ok) throw new Error("Disconnect failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const bloggerConnected = data?.connections?.blogger === "connected";
  const wordpressConnected = data?.connections?.wordpress === "connected";

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold">설정</h2>

      {notification && (
        <div
          className={`p-3 rounded-md text-sm ${
            notification.startsWith("오류")
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {notification}
        </div>
      )}

      {/* Claude API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claude API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">API Key</label>
            <div className="flex gap-2 mt-1">
              <Input
                type="password"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder={
                  data?.settings?.claude_api_key || "sk-ant-..."
                }
              />
              <Button
                size="sm"
                onClick={() => {
                  if (claudeKey) {
                    saveMutation.mutate({ claude_api_key: claudeKey });
                    setClaudeKey("");
                  }
                }}
                disabled={!claudeKey}
              >
                저장
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              .env.local의 ANTHROPIC_API_KEY가 우선 사용됩니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Blogger 연결 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Blogger
            <Badge variant={bloggerConnected ? "default" : "secondary"}>
              {bloggerConnected ? "연결됨" : "미연결"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bloggerConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate("blogger")}
            >
              연결 해제
            </Button>
          ) : (
            <a href="/api/auth/blogger">
              <Button size="sm">Blogger 연결</Button>
            </a>
          )}
        </CardContent>
      </Card>

      {/* WordPress 연결 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            WordPress
            <Badge variant={wordpressConnected ? "default" : "secondary"}>
              {wordpressConnected ? "연결됨" : "미연결"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wordpressConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate("wordpress")}
            >
              연결 해제
            </Button>
          ) : (
            <a href="/api/auth/wordpress">
              <Button size="sm">WordPress 연결</Button>
            </a>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            WordPress.com 블로그에 자동 발행합니다.
          </p>
        </CardContent>
      </Card>

      {/* 기본 톤 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 톤</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-center">
            <select
              value={defaultTone}
              onChange={(e) => setDefaultTone(e.target.value)}
              className="text-sm border rounded-md px-2 py-1.5 bg-background"
            >
              <option value="informative">정보 전달형</option>
              <option value="conversational">대화체</option>
              <option value="expert">전문가</option>
            </select>
            <Button
              size="sm"
              onClick={() =>
                saveMutation.mutate({ default_tone: defaultTone })
              }
            >
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Console */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Console 성과 추적</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">사이트 URL</label>
            <div className="flex gap-2 mt-1">
              <Input
                value={searchConsoleSite}
                onChange={(e) => setSearchConsoleSite(e.target.value)}
                placeholder="https://myblog.blogspot.com/ 또는 sc-domain:myblog.com"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (searchConsoleSite) {
                    saveMutation.mutate({ search_console_site: searchConsoleSite });
                  }
                }}
                disabled={!searchConsoleSite}
              >
                저장
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {bloggerConnected
                ? "Blogger 연결 시 Search Console도 함께 사용됩니다. 사이트 URL을 입력하면 대시보드에 성과가 표시됩니다."
                : "먼저 Blogger(Google)를 연결하세요. Search Console 권한이 함께 부여됩니다."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
