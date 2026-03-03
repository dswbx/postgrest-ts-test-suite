// bun:test assertion helpers for PostgREST test responses

import { expect } from "bun:test";
import type { TestCase } from "./config.ts";

export async function expectResponse(
  response: Response,
  expected: TestCase["expected"]
) {
  // Status
  expect(response.status).toBe(expected.status);

  // Body
  if (expected.body !== null) {
    const text = await response.text();

    if (expected.body === "") {
      expect(text).toBe("");
    } else if (typeof expected.body === "string") {
      expect(text).toBe(expected.body);
    } else {
      // JSON body
      let actual: unknown;
      try {
        actual = JSON.parse(text);
      } catch {
        throw new Error(
          `Expected JSON body but got: ${text.slice(0, 200)}`
        );
      }

      if (expected.bodyExact) {
        expect(actual).toEqual(expected.body);
      } else {
        expect(actual).toMatchObject(expected.body as any);
      }
    }
  }

  // Exact headers
  for (const [name, value] of expected.headers) {
    const actual = response.headers.get(name);
    expect(actual).toBe(value);
  }

  // Absent headers
  for (const name of expected.headersAbsent) {
    expect(response.headers.has(name)).toBe(false);
  }

  // Headers contain (substring match)
  for (const [name, substring] of expected.headersContain) {
    const actual = response.headers.get(name);
    expect(actual).not.toBeNull();
    expect(actual!).toContain(substring);
  }
}
