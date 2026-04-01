import { NextRequest, NextResponse } from "next/server";
import { getValidBloggerTokens } from "@/lib/blogger";
import {
  getPerformanceSummary,
  listSites,
  querySearchAnalytics,
} from "@/lib/search-console";

// GET /api/analytics — Search Console 성과 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteUrl = searchParams.get("siteUrl");
  const days = parseInt(searchParams.get("days") || "28", 10);
  const action = searchParams.get("action"); // "sites" | "summary" | "queries"

  // Google OAuth 토큰 재사용 (Blogger와 같은 Google 계정)
  const tokens = await getValidBloggerTokens();
  if (!tokens) {
    return NextResponse.json(
      { error: "Google not connected. Please connect Blogger in settings first." },
      { status: 401 }
    );
  }

  try {
    // 사이트 목록
    if (action === "sites") {
      const sites = await listSites(tokens.access_token);
      return NextResponse.json({ sites });
    }

    if (!siteUrl) {
      return NextResponse.json(
        { error: "siteUrl parameter is required" },
        { status: 400 }
      );
    }

    // 성과 요약 (기본)
    if (!action || action === "summary") {
      const summary = await getPerformanceSummary(
        tokens.access_token,
        siteUrl,
        days
      );
      return NextResponse.json(summary);
    }

    // 커스텀 쿼리
    if (action === "queries") {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);
      const formatDate = (d: Date) => d.toISOString().split("T")[0];

      const rows = await querySearchAnalytics(tokens.access_token, siteUrl, {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ["query"],
        rowLimit: 25,
      });

      return NextResponse.json({ rows });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analytics failed" },
      { status: 500 }
    );
  }
}
