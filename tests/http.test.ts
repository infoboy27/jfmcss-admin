import { describe, it, expect } from "vitest";
import { ok, fail, apiError, ApiError } from "../src/lib/http";

async function body(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("API envelope", () => {
  it("ok() wraps the payload under data with a 200 default", async () => {
    const res = ok({ clients: [1, 2] });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ data: { clients: [1, 2] } });
  });

  it("ok() accepts a numeric status shortcut", async () => {
    const res = ok({ id: "x" }, 201);
    expect(res.status).toBe(201);
  });

  it("fail() produces { error: { code, message } }", async () => {
    const res = fail("VALIDATION", "Nombre requerido", 400);
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ error: { code: "VALIDATION", message: "Nombre requerido" } });
  });

  it("fail() forwards extra headers", () => {
    const res = fail("RATE_LIMITED", "slow down", 429, { "retry-after": "30" });
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("apiError maps auth sentinels", async () => {
    expect((await body(apiError(new Error("UNAUTHENTICATED")))).error).toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await body(apiError(new Error("FORBIDDEN")))).error).toMatchObject({ code: "FORBIDDEN" });
  });

  it("apiError maps a Postgres unique-violation to 409 CONFLICT", async () => {
    const res = apiError({ code: "23505" });
    expect(res.status).toBe(409);
    expect((await body(res)).error).toMatchObject({ code: "CONFLICT" });
  });

  it("apiError never leaks an unknown 500's detail", async () => {
    const res = apiError(new Error("connection string password=secret"));
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ error: { code: "INTERNAL", message: "Error interno" } });
  });

  it("ApiError carries through its code and status", async () => {
    const res = apiError(new ApiError("SEQUENCE_EXHAUSTED", "Secuencia fiscal agotada", 422));
    expect(res.status).toBe(422);
    expect((await body(res)).error).toMatchObject({ code: "SEQUENCE_EXHAUSTED", message: "Secuencia fiscal agotada" });
  });
});
