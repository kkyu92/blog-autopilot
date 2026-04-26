import slugify from "slugify";

export function makeSlug(title: string): string {
  const result = slugify(title, { lower: true, strict: true, trim: true });
  if (!result) {
    // Fallback for all-Hangul/non-ASCII input — use simple hash of title
    const hash = Math.abs(
      title.split("").reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)
    )
      .toString(36)
      .slice(0, 6);
    return "post-" + hash;
  }
  return result;
}

export function resolveBatchCollisions(slugs: string[]): string[] {
  const seen = new Set<string>();
  return slugs.map((slug) => {
    let candidate = slug;
    let i = 2;
    while (seen.has(candidate)) {
      candidate = `${slug}-${i}`;
      i++;
    }
    seen.add(candidate);
    return candidate;
  });
}
