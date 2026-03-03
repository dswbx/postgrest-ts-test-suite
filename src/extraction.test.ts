// Validates the structural integrity of extracted JSON specs
import { describe, it, expect } from "bun:test";
import type { TestSpec } from "./lib/config.ts";

const SPEC_FILES = [
   "query",
   "and-or-params",
   "json-operator",
   "range",
   "singular",
];

for (const name of SPEC_FILES) {
   const spec: TestSpec = require(`../specs/${name}.json`);

   describe(`${name}.json structural integrity`, () => {
      it("has required top-level fields", () => {
         expect(spec.file).toBeString();
         expect(spec.config).toBeString();
         expect(spec.tests).toBeArray();
         expect(spec.tests.length).toBeGreaterThan(0);
      });

      it("all tests have valid descriptions", () => {
         for (const test of spec.tests) {
            expect(test.description).toBeArray();
            expect(test.description.length).toBeGreaterThanOrEqual(1);
            for (const d of test.description) {
               expect(d).toBeString();
               expect(d.length).toBeGreaterThan(0);
            }
         }
      });

      it("all tests have valid requests", () => {
         for (const test of spec.tests) {
            const { request } = test;
            expect([
               "GET",
               "POST",
               "PUT",
               "PATCH",
               "DELETE",
               "HEAD",
               "OPTIONS",
            ]).toContain(request.method);
            expect(request.path).toBeString();
            // Most paths start with /, but some upstream tests omit it
            expect(request.path.length).toBeGreaterThan(0);
            expect(request.headers).toBeArray();
            for (const h of request.headers) {
               expect(h).toBeArray();
               expect(h.length).toBe(2);
               expect(h[0]).toBeString();
               expect(h[1]).toBeString();
            }
         }
      });

      it("all tests have valid expected responses", () => {
         for (const test of spec.tests) {
            const { expected } = test;
            expect(expected.status).toBeNumber();
            expect(expected.status).toBeGreaterThanOrEqual(100);
            expect(expected.status).toBeLessThan(600);
            expect(expected.bodyExact).toBeBoolean();
            expect(expected.headers).toBeArray();
            expect(expected.headersAbsent).toBeArray();
            expect(expected.headersContain).toBeArray();
         }
      });

      it("no test has undefined or NaN in body", () => {
         for (const test of spec.tests) {
            const bodyStr = JSON.stringify(test.expected.body);
            if (bodyStr) {
               expect(bodyStr).not.toContain("undefined");
               expect(bodyStr).not.toContain("NaN");
            }
         }
      });

      it("request bodies are null or valid JSON strings", () => {
         for (const test of spec.tests) {
            if (test.request.body !== null) {
               expect(typeof test.request.body).toBe("string");
               // Should be valid JSON or empty string
               if (test.request.body !== "") {
                  expect(() => JSON.parse(test.request.body!)).not.toThrow();
               }
            }
         }
      });
   });
}

// Cross-file stats
describe("extraction stats", () => {
   it("reports expected test counts", () => {
      const stats = require("../specs/_stats.json");
      expect(stats.totalFiles).toBe(5);
      expect(stats.totalTests).toBeGreaterThan(400);
      console.log(
         `Total: ${stats.totalTests} tests, ${stats.totalFlagged} flagged`
      );
      for (const f of stats.files) {
         console.log(`  ${f.name}: ${f.tests} extracted, ${f.flagged} flagged`);
      }
   });

   it("flagged tests have valid reasons", () => {
      const flagged = require("../specs/_flagged.json");
      for (const f of flagged) {
         expect(f.description).toBeArray();
         expect(f.reason).toBeString();
         expect(f.reason.length).toBeGreaterThan(0);
         expect(f.line).toBeNumber();
         expect(f.file).toBeString();
      }
   });
});
