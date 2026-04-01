import { describe, it, expect } from "vitest";
import { isExpired, type OAuthTokens } from "@/lib/tokens";

describe("isExpired", () => {
  it("returns false for tokens expiring in more than 5 minutes", () => {
    const tokens: OAuthTokens = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes
    };
    expect(isExpired(tokens)).toBe(false);
  });

  it("returns true for tokens expiring in less than 5 minutes", () => {
    const tokens: OAuthTokens = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Date.now() + 3 * 60 * 1000, // 3 minutes
    };
    expect(isExpired(tokens)).toBe(true);
  });

  it("returns true for already expired tokens", () => {
    const tokens: OAuthTokens = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Date.now() - 1000, // already expired
    };
    expect(isExpired(tokens)).toBe(true);
  });
});
