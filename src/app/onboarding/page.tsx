"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [apiKey, setApiKey] = useState("");
  const [apiStatus, setApiStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [bloggerStatus, setBloggerStatus] = useState<
    "idle" | "connected" | "skipped"
  >("idle");

  // Step 1: Claude API 키 검증
  const checkApiKey = async () => {
    if (!apiKey.trim()) return;
    setApiStatus("checking");

    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claude_api_key: apiKey }),
      });
      setApiStatus("valid");
    } catch {
      setApiStatus("invalid");
    }
  };

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Content Autopilot 설정</h1>
        <p className="text-muted-foreground">시작하기 위한 간단한 설정</p>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s
                ? "bg-primary text-primary-foreground"
                : step > s
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step > s ? "✓" : s}
          </div>
        ))}
      </div>

      {/* Step 1: Claude API */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1. Claude API 키 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              AI 콘텐츠 생성을 위해 Anthropic API 키가 필요합니다.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
              />
              <Button onClick={checkApiKey} disabled={apiStatus === "checking"}>
                {apiStatus === "checking" ? "확인 중..." : "확인"}
              </Button>
            </div>
            {apiStatus === "valid" && (
              <Badge variant="default">API 키 저장됨</Badge>
            )}
            {apiStatus === "invalid" && (
              <Badge variant="destructive">유효하지 않은 키</Badge>
            )}
            <p className="text-xs text-muted-foreground">
              .env.local에 ANTHROPIC_API_KEY가 이미 설정되어 있다면 건너뛰세요.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => setStep(2)}
                disabled={apiStatus !== "valid"}
              >
                다음
              </Button>
              <Button variant="ghost" onClick={() => setStep(2)}>
                건너뛰기
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Blogger 연결 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>2. 블로그 연결</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              생성한 글을 발행할 블로그를 연결하세요.
            </p>
            <div className="flex gap-2">
              <a href="/api/auth/blogger">
                <Button>Blogger 연결</Button>
              </a>
              <a href="/api/auth/naver">
                <Button variant="outline">네이버 연결</Button>
              </a>
            </div>
            {bloggerStatus === "connected" && (
              <Badge variant="default">연결 완료</Badge>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setStep(3)}>다음</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setBloggerStatus("skipped");
                  setStep(3);
                }}
              >
                나중에 하기
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 첫 키워드 검색 */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>3. 준비 완료!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              설정이 완료되었습니다. 첫 번째 키워드를 찾아보세요.
            </p>
            <Button className="w-full" onClick={() => router.push("/topics")}>
              키워드 탐색하기
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/")}
            >
              대시보드로 이동
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
