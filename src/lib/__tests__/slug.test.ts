import { describe, it, expect } from "vitest";
import { makeSlug, resolveBatchCollisions } from "../slug";

describe("makeSlug", () => {
  it("한글 제목 → matches /[a-z0-9-]+/", () => {
    const result = makeSlug("봄나들이 좋은 명소 5곳");
    expect(result).toMatch(/[a-z0-9-]+/);
  });

  it("특수문자·이모지 제거", () => {
    const result = makeSlug("★ Hot 키워드 🔥");
    expect(result).not.toMatch(/[★🔥]/);
  });

  it("소문자 + 하이픈 — Hello World → hello-world", () => {
    expect(makeSlug("Hello World")).toBe("hello-world");
  });

  it("영문 + 숫자 — Top 5 Reasons", () => {
    const result = makeSlug("Top 5 Reasons");
    expect(result).toBe("top-5-reasons");
  });

  it("연속 공백 → 단일 하이픈", () => {
    expect(makeSlug("hello   world")).toBe("hello-world");
  });

  it("앞뒤 공백 trimming", () => {
    expect(makeSlug("  hello world  ")).toBe("hello-world");
  });

  it("이미 slug 형태인 입력 — idempotent", () => {
    expect(makeSlug("hello-world")).toBe("hello-world");
  });
});

describe("resolveBatchCollisions", () => {
  it("같은 slug 2개 → 두 번째에 -2 suffix", () => {
    const result = resolveBatchCollisions(["foo-bar", "foo-bar", "baz"]);
    expect(result).toEqual(["foo-bar", "foo-bar-2", "baz"]);
  });

  it("3개 같으면 -2, -3", () => {
    expect(resolveBatchCollisions(["a", "a", "a"])).toEqual(["a", "a-2", "a-3"]);
  });

  it("빈 배열 → 빈 배열", () => {
    expect(resolveBatchCollisions([])).toEqual([]);
  });

  it("충돌 없으면 그대로", () => {
    expect(resolveBatchCollisions(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("혼합: 일부만 충돌", () => {
    const result = resolveBatchCollisions(["foo", "bar", "foo", "baz"]);
    expect(result).toEqual(["foo", "bar", "foo-2", "baz"]);
  });

  it("10개 충돌 → x, x-2 ... x-10", () => {
    const input = Array(10).fill("x");
    const expected = ["x", "x-2", "x-3", "x-4", "x-5", "x-6", "x-7", "x-8", "x-9", "x-10"];
    expect(resolveBatchCollisions(input)).toEqual(expected);
  });

  it("pre-existing -2 variant: ['foo', 'foo-2', 'foo'] → ['foo', 'foo-2', 'foo-3'] (seen-set skips taken variants)", () => {
    // 'foo' is seen, try 'foo-2' — but 'foo-2' is already in seen set (added as 2nd element),
    // so algorithm continues to 'foo-3'. Behavior lock.
    const result = resolveBatchCollisions(["foo", "foo-2", "foo"]);
    expect(result).toEqual(["foo", "foo-2", "foo-3"]);
  });
});
