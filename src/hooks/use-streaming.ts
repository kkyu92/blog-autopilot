"use client";

import { useCallback, useRef, useState } from "react";

interface StreamingState {
  isStreaming: boolean;
  text: string;
  error: string | null;
}

interface StartParams {
  contentId: string;
  keyword: string;
  tone?: string;
  targetLength?: number;
  sourceSummaries?: string;
}

interface UseStreamingOptions {
  onComplete?: (text: string) => void;
}

interface UseStreamingReturn extends StreamingState {
  start: (params: StartParams) => void;
  stop: () => void;
  setText: (text: string) => void;
}

export function useStreaming(options?: UseStreamingOptions): UseStreamingReturn {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    text: "",
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  const start = useCallback(
    (params: StartParams) => {
      // 이전 스트림 중단
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      setState({ isStreaming: true, text: "", error: null });

      (async () => {
        try {
          const res = await fetch("/api/content/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
            signal: controller.signal,
          });

          if (!res.ok) {
            const err = await res.json();
            setState((s) => ({
              ...s,
              isStreaming: false,
              error: err.error || "Generation failed",
            }));
            return;
          }

          const reader = res.body?.getReader();
          if (!reader) return;

          const decoder = new TextDecoder();
          let accumulated = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6);
              try {
                const parsed = JSON.parse(json);
                if (parsed.error) {
                  setState((s) => ({
                    ...s,
                    isStreaming: false,
                    error: parsed.error,
                  }));
                  return;
                }
                if (parsed.text) {
                  accumulated += parsed.text;
                  setState((s) => ({ ...s, text: accumulated }));
                }
                if (parsed.done) {
                  setState((s) => ({ ...s, isStreaming: false }));
                  optionsRef.current?.onComplete?.(accumulated);
                  return;
                }
              } catch {
                // 파싱 실패한 줄은 무시
              }
            }
          }

          setState((s) => ({ ...s, isStreaming: false }));
        } catch (err) {
          if (controller.signal.aborted) {
            setState((s) => ({ ...s, isStreaming: false }));
            return;
          }
          setState((s) => ({
            ...s,
            isStreaming: false,
            error: err instanceof Error ? err.message : "Stream failed",
          }));
        }
      })();
    },
    []
  );

  const setText = useCallback((text: string) => {
    setState((s) => ({ ...s, text }));
  }, []);

  return { ...state, start, stop, setText };
}
