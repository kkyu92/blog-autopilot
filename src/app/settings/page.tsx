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
  const [notification, setNotification] = useState<string | null>(null);

  // URL 파라미터로 알림 표시
  useEffect(() => {
    if (searchParams.get("blogger") === "connected") {
      setNotification("Blogger 연결 완료!");
    } else if (searchParams.get("naver") === "connected") {
      setNotification("네이버 블로그 연결 완료!");
    } else if (searchParams.get("error")) {
      setNotification(`오류: ${searchParams.get("error")}`);
    }
  }, [searchParams]);

  const { data } = useQuery<{
    settings: Record<string, string>;
    connections: { blogger: string; naver: string };
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
      if (data.settings.default_tone) setDefaultTone(data.settings.default_tone);
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
  const naverConnected = data?.connections?.naver === "connected";

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

      {/* 네이버 블로그 연결 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            네이버 블로그
            <Badge variant={naverConnected ? "default" : "secondary"}>
              {naverConnected ? "연결됨" : "미연결"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {naverConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate("naver")}
            >
              연결 해제
            </Button>
          ) : (
            <a href="/api/auth/naver">
              <Button size="sm">네이버 연결</Button>
            </a>
          )}
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
    </div>
  );
}
