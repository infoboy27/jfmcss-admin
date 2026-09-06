import { describe, it, expect, vi } from "vitest";

// Keep renderMetrics off a real socket: its DB sample should degrade to db_up 0.
vi.mock("../src/lib/db", () => ({
  pool: { totalCount: 3, idleCount: 2, waitingCount: 0 },
  query: () => Promise.reject(new Error("no db in unit test")),
}));

import { inc, recordApiResponse, renderMetrics } from "../src/lib/metrics";
import { contentMatchesType } from "../src/lib/filetype";

describe("metrics counters", () => {
  it("accumulates labelled counters and renders Prometheus text", async () => {
    inc("jfmcss_test_total", { a: "1" });
    inc("jfmcss_test_total", { a: "1" });
    inc("jfmcss_test_total", { a: "2" });
    recordApiResponse(200);
    recordApiResponse(404);
    recordApiResponse(503);

    const out = await renderMetrics();
    expect(out).toContain('jfmcss_test_total{a="1"} 2');
    expect(out).toContain('jfmcss_test_total{a="2"} 1');
    expect(out).toContain('jfmcss_api_responses_total{class="2xx"} 1');
    expect(out).toContain('jfmcss_api_responses_total{class="4xx"} 1');
    expect(out).toContain('jfmcss_api_responses_total{class="5xx"} 1');
    expect(out).toMatch(/# TYPE jfmcss_test_total counter/);
    expect(out).toContain("jfmcss_db_up 0"); // DB unreachable → 0
    expect(out).toContain("jfmcss_db_pool_total 3");
    expect(out).toContain("jfmcss_build_info");
  });
});

describe("filetype magic-byte sniffing", () => {
  const pdf = Buffer.from("%PDF-1.7\n...");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);

  it("accepts matching content", () => {
    expect(contentMatchesType(pdf, "application/pdf")).toBe(true);
    expect(contentMatchesType(png, "image/png")).toBe(true);
    expect(contentMatchesType(jpeg, "image/jpeg")).toBe(true);
    expect(contentMatchesType(zip, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    expect(contentMatchesType(Buffer.from("hola mundo"), "text/plain")).toBe(true);
  });
  it("rejects a mismatch (html renamed to .pdf) and unknown types", () => {
    expect(contentMatchesType(Buffer.from("<html><script>"), "application/pdf")).toBe(false);
    expect(contentMatchesType(pdf, "image/png")).toBe(false);
    expect(contentMatchesType(Buffer.from([0, 1, 2]), "text/plain")).toBe(false); // NUL byte
    expect(contentMatchesType(pdf, "application/x-evil")).toBe(false);
  });
});
