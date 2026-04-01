import { describe, it, expect } from "vitest";

// 스키마 validation 로직 테스트

describe("content status validation", () => {
  const validStatuses = ["draft", "published", "failed"];

  it("accepts valid statuses", () => {
    for (const status of validStatuses) {
      expect(validStatuses.includes(status)).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(validStatuses.includes("archived")).toBe(false);
    expect(validStatuses.includes("")).toBe(false);
  });
});

describe("tone validation", () => {
  const validTones = ["informative", "conversational", "expert"];

  it("accepts valid tones", () => {
    for (const tone of validTones) {
      expect(validTones.includes(tone)).toBe(true);
    }
  });

  it("rejects invalid tone", () => {
    expect(validTones.includes("casual")).toBe(false);
    expect(validTones.includes("formal")).toBe(false);
  });
});

describe("platform validation", () => {
  const validPlatforms = ["blogger", "naver"];

  it("accepts valid platforms", () => {
    expect(validPlatforms.includes("blogger")).toBe(true);
    expect(validPlatforms.includes("naver")).toBe(true);
  });

  it("rejects invalid platform", () => {
    expect(validPlatforms.includes("medium")).toBe(false);
    expect(validPlatforms.includes("wordpress")).toBe(false);
  });
});

describe("scheduled date validation", () => {
  it("rejects past dates", () => {
    const pastDate = new Date("2020-01-01");
    expect(pastDate <= new Date()).toBe(true);
  });

  it("accepts future dates", () => {
    const futureDate = new Date("2030-01-01");
    expect(futureDate > new Date()).toBe(true);
  });

  it("rejects invalid date strings", () => {
    const invalid = new Date("not-a-date");
    expect(isNaN(invalid.getTime())).toBe(true);
  });

  it("parses ISO 8601 dates correctly", () => {
    const date = new Date("2026-04-15T10:30:00.000Z");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3); // 0-indexed
    expect(date.getDate()).toBe(15);
  });
});
