import { describe, it, expect } from "vitest";
import { rateLimit } from "../src/lib/ratelimit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks within the window", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 60).ok).toBe(true);
    expect(rateLimit(a, 1, 60).ok).toBe(false);
    expect(rateLimit(b, 1, 60).ok).toBe(true);
  });

  it("reports decreasing remaining allowance", () => {
    const key = `rem:${Math.random()}`;
    expect(rateLimit(key, 5, 60).remaining).toBe(4);
    expect(rateLimit(key, 5, 60).remaining).toBe(3);
  });
});
