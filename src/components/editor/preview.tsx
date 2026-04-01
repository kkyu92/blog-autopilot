"use client";

import { useMemo } from "react";
import { marked } from "marked";

interface PreviewProps {
  markdown: string;
}

export function Preview({ markdown }: PreviewProps) {
  const html = useMemo(() => {
    if (!markdown) return "";
    return marked.parse(markdown, { async: false }) as string;
  }, [markdown]);

  if (!markdown) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        미리보기가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div
      className="p-4 prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
