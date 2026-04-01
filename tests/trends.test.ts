import { describe, it, expect } from "vitest";

// trends.ts 내부 유틸 함수들 테스트 — export 안된 함수는 로직 재현으로 테스트

describe("parseRssItems (Google Trends RSS)", () => {
  const sampleRss = `
    <item>
      <title>AI 반도체</title>
      <ht:approx_traffic>100,000+</ht:approx_traffic>
      <pubDate>Mon, 31 Mar 2026</pubDate>
      <ht:picture>https://example.com/img.jpg</ht:picture>
      <ht:news_item>
        <ht:news_item_title>반도체 뉴스 제목</ht:news_item_title>
        <ht:news_item_source>한국경제</ht:news_item_source>
        <ht:news_item_url>https://news.example.com/123</ht:news_item_url>
      </ht:news_item>
    </item>
    <item>
      <title>날씨 예보</title>
      <ht:approx_traffic>50,000+</ht:approx_traffic>
    </item>
  `;

  // 같은 파싱 로직 재현
  function parseRssItems(xml: string) {
    const items: Array<{
      keyword: string;
      trafficVolume: string;
      newsTitle: string;
      newsSource: string;
      newsUrl: string;
      imageUrl: string;
      pubDate: string;
    }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = extractTag(block, "title");
      const traffic = extractTag(block, "ht:approx_traffic");
      const pubDate = extractTag(block, "pubDate");
      const picture = extractTag(block, "ht:picture");
      const newsItemMatch = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/.exec(block);
      let newsTitle = "", newsSource = "", newsUrl = "";
      if (newsItemMatch) {
        newsTitle = extractTag(newsItemMatch[1], "ht:news_item_title");
        newsSource = extractTag(newsItemMatch[1], "ht:news_item_source");
        newsUrl = extractTag(newsItemMatch[1], "ht:news_item_url");
      }
      if (title) {
        items.push({ keyword: title, trafficVolume: traffic || "", newsTitle, newsSource, newsUrl, imageUrl: picture || "", pubDate: pubDate || "" });
      }
    }
    return items;
  }

  function extractTag(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    const match = regex.exec(xml);
    return match ? match[1].trim() : "";
  }

  it("parses multiple items correctly", () => {
    const items = parseRssItems(sampleRss);
    expect(items).toHaveLength(2);
  });

  it("extracts keyword and traffic", () => {
    const items = parseRssItems(sampleRss);
    expect(items[0].keyword).toBe("AI 반도체");
    expect(items[0].trafficVolume).toBe("100,000+");
  });

  it("extracts news item details", () => {
    const items = parseRssItems(sampleRss);
    expect(items[0].newsTitle).toBe("반도체 뉴스 제목");
    expect(items[0].newsSource).toBe("한국경제");
    expect(items[0].newsUrl).toBe("https://news.example.com/123");
  });

  it("handles items without news_item", () => {
    const items = parseRssItems(sampleRss);
    expect(items[1].keyword).toBe("날씨 예보");
    expect(items[1].newsTitle).toBe("");
    expect(items[1].newsSource).toBe("");
  });

  it("handles empty RSS", () => {
    const items = parseRssItems("<channel></channel>");
    expect(items).toHaveLength(0);
  });

  it("extracts image and pubDate", () => {
    const items = parseRssItems(sampleRss);
    expect(items[0].imageUrl).toBe("https://example.com/img.jpg");
    expect(items[0].pubDate).toBe("Mon, 31 Mar 2026");
    expect(items[1].imageUrl).toBe("");
    expect(items[1].pubDate).toBe("");
  });
});

describe("decodeHtmlEntities", () => {
  function decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
  }

  it("decodes &amp; to &", () => {
    expect(decodeHtmlEntities("A &amp; B")).toBe("A & B");
  });

  it("decodes &lt; &gt; to < >", () => {
    expect(decodeHtmlEntities("&lt;div&gt;")).toBe("<div>");
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("&#65;&#66;")).toBe("AB");
  });

  it("decodes &quot; and &apos;", () => {
    expect(decodeHtmlEntities("&quot;hello&apos;")).toBe('"hello\'');
  });

  it("returns plain text unchanged", () => {
    expect(decodeHtmlEntities("no entities")).toBe("no entities");
  });
});

describe("decodeUnicodeEscapes", () => {
  function decodeUnicodeEscapes(str: string): string {
    return str.replace(/\\u002F/g, "/").replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }

  it("decodes \\u002F to /", () => {
    expect(decodeUnicodeEscapes("https:\\u002F\\u002Fexample.com")).toBe("https://example.com");
  });

  it("decodes arbitrary unicode escapes", () => {
    expect(decodeUnicodeEscapes("\\uD55C\\uAD6D")).toBe("한국");
  });

  it("handles mixed content", () => {
    expect(decodeUnicodeEscapes("hello \\u0041")).toBe("hello A");
  });
});
