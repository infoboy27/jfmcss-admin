import { describe, it, expect } from "vitest";
import { text, optionalText, numberValue, dateValue } from "../src/lib/validate";

describe("validate helpers", () => {
  it("text trims, caps length and rejects non-strings", () => {
    expect(text("  hi  ")).toBe("hi");
    expect(text("abcdef", 3)).toBe("abc");
    expect(text(42)).toBe("");
    expect(text(null)).toBe("");
  });

  it("optionalText returns null for empty", () => {
    expect(optionalText("   ")).toBeNull();
    expect(optionalText("x")).toBe("x");
  });

  it("numberValue coerces strings and falls back safely", () => {
    expect(numberValue("12.5")).toBe(12.5);
    expect(numberValue("")).toBe(0);
    expect(numberValue("abc", 7)).toBe(7);
    expect(numberValue(Infinity)).toBe(0);
    expect(numberValue(undefined, 3)).toBe(3);
  });

  it("dateValue only accepts ISO calendar dates", () => {
    expect(dateValue("2026-09-06")).toBe("2026-09-06");
    expect(dateValue("06/09/2026")).toBeNull();
    expect(dateValue("2026-09-06T00:00:00Z")).toBeNull();
    expect(dateValue(123)).toBeNull();
  });
});
