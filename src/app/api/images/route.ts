import { NextRequest, NextResponse } from "next/server";

// GET /api/images?q=keyword — Unsplash 이미지 검색
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: "q parameter is required" },
      { status: 400 }
    );
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    // Unsplash 키 없으면 Pixabay 무료 API 시도
    return getPixabayImages(q);
  }

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=6&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${accessKey}` },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) throw new Error(`Unsplash API failed: ${res.status}`);
    const data = await res.json();

    const images = (data.results || []).map(
      (img: {
        id: string;
        urls: { regular: string; small: string };
        alt_description: string;
        user: { name: string; links: { html: string } };
      }) => ({
        id: img.id,
        url: img.urls.regular,
        thumb: img.urls.small,
        alt: img.alt_description || q,
        credit: `Photo by ${img.user.name} on Unsplash`,
        creditUrl: img.user.links.html,
      })
    );

    return NextResponse.json({ images, source: "unsplash" });
  } catch (err) {
    return NextResponse.json(
      {
        error: "이미지 검색 실패",
        message: err instanceof Error ? err.message : "Unknown",
        images: [],
      },
      { status: 502 }
    );
  }
}

async function getPixabayImages(q: string) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      images: [],
      source: "none",
      message: "UNSPLASH_ACCESS_KEY 또는 PIXABAY_API_KEY를 설정하세요",
    });
  }

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(q)}&per_page=6&image_type=photo&orientation=horizontal&lang=ko`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) throw new Error(`Pixabay API failed: ${res.status}`);
    const data = await res.json();

    const images = (data.hits || []).map(
      (img: {
        id: number;
        webformatURL: string;
        previewURL: string;
        tags: string;
        user: string;
      }) => ({
        id: String(img.id),
        url: img.webformatURL,
        thumb: img.previewURL,
        alt: img.tags || q,
        credit: `Photo by ${img.user} on Pixabay`,
        creditUrl: `https://pixabay.com/users/${img.user}`,
      })
    );

    return NextResponse.json({ images, source: "pixabay" });
  } catch (err) {
    return NextResponse.json(
      {
        error: "이미지 검색 실패",
        message: err instanceof Error ? err.message : "Unknown",
        images: [],
      },
      { status: 502 }
    );
  }
}
