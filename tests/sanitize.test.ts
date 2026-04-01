import { describe, it, expect } from "vitest";
import { markdownToHtml, sanitize, renderForPublish } from "@/lib/sanitize";

describe("markdownToHtml", () => {
  it("converts basic markdown to HTML", () => {
    const html = markdownToHtml("# Hello\n\nParagraph text");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>Paragraph text</p>");
  });

  it("converts lists", () => {
    const html = markdownToHtml("- item 1\n- item 2");
    expect(html).toContain("<li>item 1</li>");
    expect(html).toContain("<li>item 2</li>");
  });

  it("converts code blocks", () => {
    const html = markdownToHtml("```\nconst x = 1;\n```");
    expect(html).toContain("<code>");
  });

  it("converts bold and italic", () => {
    const html = markdownToHtml("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });
});

describe("sanitize", () => {
  it("removes script tags", () => {
    const result = sanitize('<p>Hello</p><script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>Hello</p>");
  });

  it("removes onclick attributes", () => {
    const result = sanitize('<p onclick="alert(1)">Click</p>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("<p>Click</p>");
  });

  it("removes iframe tags", () => {
    const result = sanitize('<iframe src="evil.com"></iframe>');
    expect(result).not.toContain("<iframe>");
  });

  it("allows safe tags", () => {
    const html =
      "<h2>Title</h2><p>Text with <strong>bold</strong> and <a href=\"https://example.com\">link</a></p>";
    const result = sanitize(html);
    expect(result).toContain("<h2>");
    expect(result).toContain("<strong>");
    expect(result).toContain("<a href=");
  });

  it("strips javascript: URLs", () => {
    const result = sanitize('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });
});

describe("renderForPublish", () => {
  it("converts markdown to sanitized HTML", () => {
    const result = renderForPublish(
      "## Test\n\nParagraph with **bold**."
    );
    expect(result).toContain("<h2>Test</h2>");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).not.toContain("<script>");
  });
});
