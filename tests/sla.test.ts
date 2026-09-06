import { describe, it, expect } from "vitest";
import { slaSnapshot, addHours } from "../src/lib/sla";

const base = (over: Partial<Parameters<typeof slaSnapshot>[0]> = {}) => ({
  status: "OPEN",
  created_at: "2026-01-01T00:00:00.000Z",
  first_response_at: null,
  resolved_at: null,
  first_response_due_at: "2026-01-01T04:00:00.000Z", // 4h target
  resolution_due_at: "2026-01-01T24:00:00.000Z", // 24h-ish target (uses 1d)
  sla_paused_seconds: 0,
  sla_paused_at: null,
  ...over,
});

describe("slaSnapshot", () => {
  it("reports elapsed percent and breach on an open ticket", () => {
    const now = new Date("2026-01-01T03:00:00.000Z").getTime(); // 75% through first response
    const s = slaSnapshot(base(), now);
    expect(s.open).toBe(true);
    expect(s.firstResponse.pct).toBe(75);
    expect(s.firstResponse.breached).toBe(false);
    expect(s.resolution.breached).toBe(false);
  });

  it("marks a target breached once the clock passes due while still open", () => {
    const now = new Date("2026-01-01T05:00:00.000Z").getTime();
    const s = slaSnapshot(base(), now);
    expect(s.firstResponse.breached).toBe(true);
  });

  it("freezes first-response clock at the moment it was answered", () => {
    const s = slaSnapshot(
      base({ first_response_at: "2026-01-01T02:00:00.000Z" }),
      new Date("2026-01-01T20:00:00.000Z").getTime(),
    );
    expect(s.firstResponse.done).toBe(true);
    expect(s.firstResponse.pct).toBe(50); // answered halfway to the 4h target
    expect(s.firstResponse.breached).toBe(false);
  });

  it("extends the due time by banked paused seconds (waiting on client)", () => {
    const now = new Date("2026-01-01T05:00:00.000Z").getTime();
    const withoutPause = slaSnapshot(base(), now).firstResponse.breached;
    const withPause = slaSnapshot(base({ sla_paused_seconds: 2 * 3600 }), now).firstResponse.breached;
    expect(withoutPause).toBe(true);
    expect(withPause).toBe(false); // +2h of pause pushes the 4h target to 6h
  });

  it("never breaches a resolved ticket", () => {
    const s = slaSnapshot(
      base({ status: "RESOLVED", resolved_at: "2026-01-05T00:00:00.000Z" }),
      Date.now(),
    );
    expect(s.open).toBe(false);
    expect(s.resolution.breached).toBe(false);
  });
});

describe("addHours", () => {
  it("adds fractional hours", () => {
    expect(addHours(new Date("2026-01-01T00:00:00Z"), 0.25).toISOString()).toBe("2026-01-01T00:15:00.000Z");
  });
});
