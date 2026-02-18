// Smoke test: verify the test registration and runtime work with a mock handler
import { describe, it, expect, beforeAll } from "bun:test";
import type { TestSpec } from "../config.ts";
import { registerSpecs } from "../register.ts";
import { executeRequest } from "../client.ts";
import { expectResponse } from "../matchers.ts";

// Simple mock handler
const mockHandler = (req: Request): Response => {
  const url = new URL(req.url);
  if (url.pathname === "/items" && req.method === "GET") {
    return new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Range": "0-1/*",
      },
    });
  }
  return new Response("Not Found", { status: 404 });
};

describe("smoke test", () => {
  it("executeRequest works with handler function", async () => {
    const res = await executeRequest(mockHandler, {
      method: "GET",
      path: "/items",
      headers: [],
      body: null,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("expectResponse validates correctly", async () => {
    const res = await executeRequest(mockHandler, {
      method: "GET",
      path: "/items",
      headers: [],
      body: null,
    });
    await expectResponse(res, {
      status: 200,
      body: [{ id: 1 }, { id: 2 }],
      bodyExact: true,
      headers: [["Content-Type", "application/json; charset=utf-8"]],
      headersAbsent: [],
      headersContain: [],
    });
  });

  it("expectResponse catches status mismatch", async () => {
    const res = await executeRequest(mockHandler, {
      method: "GET",
      path: "/items",
      headers: [],
      body: null,
    });
    expect(() =>
      expectResponse(res, {
        status: 404,
        body: null,
        bodyExact: true,
        headers: [],
        headersAbsent: [],
        headersContain: [],
      })
    ).toThrow();
  });
});
