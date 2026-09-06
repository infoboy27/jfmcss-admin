import { describe, it, expect } from "vitest";
import { readPage, pageMeta } from "../src/lib/pagination";

const req = (qs: string) => new Request(`http://x/api/things${qs}`);

describe("readPage", () => {
  it("defaults, clamps and floors", () => {
    expect(readPage(req(""))).toEqual({ limit: 50, offset: 0 });
    expect(readPage(req("?limit=10&offset=20"))).toEqual({ limit: 10, offset: 20 });
    expect(readPage(req("?limit=99999"))).toEqual({ limit: 200, offset: 0 }); // maxLimit
    expect(readPage(req("?limit=0"))).toEqual({ limit: 50, offset: 0 }); // min 1 → falsy → default
    expect(readPage(req("?offset=-5"))).toEqual({ limit: 50, offset: 0 });
    expect(readPage(req("?limit=abc"))).toEqual({ limit: 50, offset: 0 });
  });
  it("honours custom bounds", () => {
    expect(readPage(req("?limit=800"), { defaultLimit: 100, maxLimit: 1000 })).toEqual({ limit: 800, offset: 0 });
  });
});

describe("pageMeta", () => {
  it("computes hasMore from offset + returned vs total", () => {
    expect(pageMeta(50, 120, { limit: 50, offset: 0 })).toMatchObject({ total: 120, hasMore: true });
    expect(pageMeta(20, 120, { limit: 50, offset: 100 })).toMatchObject({ hasMore: false });
    expect(pageMeta(0, 0, { limit: 50, offset: 0 })).toMatchObject({ hasMore: false });
  });
});
