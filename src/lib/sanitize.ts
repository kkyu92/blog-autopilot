import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Markdown → HTML 변환
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

// HTML 살균 (XSS 방지)
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "strong", "em", "b", "i", "u", "s", "del",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  code: ["class"],
  pre: ["class"],
  td: ["align"],
  th: ["align"],
};

export function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
  });
}

// Markdown → 살균된 HTML (발행용)
export function renderForPublish(markdown: string): string {
  const html = markdownToHtml(markdown);
  return sanitize(html);
}
