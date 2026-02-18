// Main export: definePostgrestTests(options)

import { beforeAll } from "bun:test";
import type { MatchPattern, TestSuiteOptions, TestSpec } from "./config.ts";
import { registerSpecs } from "./register.ts";
export { executeRequest } from "./client.ts";
export { expectResponse } from "./matchers.ts";

export function definePostgrestTests(options: TestSuiteOptions) {
   if (options.setup) {
      beforeAll(options.setup);
   }

   // Load and filter spec files
   const specs = loadSpecs(options);

   // Register all tests
   registerSpecs(specs, options);
}

function loadSpecs(options: TestSuiteOptions): TestSpec[] {
   const specsDir = new URL("../specs/", import.meta.url).pathname;

   // Read all JSON files from specs/
   const { readdirSync } = require("node:fs");
   let files: string[];
   try {
      files = readdirSync(specsDir).filter(
         (f: string) => f.endsWith(".json") && !f.startsWith("_")
      );
   } catch {
      throw new Error(`No specs directory found at ${specsDir}`);
   }

   let specs: TestSpec[] = files.map((f: string) => {
      const content = require(`${specsDir}/${f}`);
      return content as TestSpec;
   });

   // Apply skip/only filters
   if (options.only?.length) {
      specs = specs.filter((s) =>
         options.only!.some((name) =>
            s.file.toLowerCase().includes(name.toLowerCase())
         )
      );
   }

   if (options.skip?.length) {
      specs = specs.filter(
         (s) =>
            !options.skip!.some((pattern) => matchesPattern(s.file, pattern))
      );
   }

   return specs;
}

function matchesPattern(value: string, pattern: MatchPattern): boolean {
   if (typeof pattern === "string") {
      return value.toLowerCase().includes(pattern.toLowerCase());
   }

   const prevLastIndex = pattern.lastIndex;
   pattern.lastIndex = 0;
   const matched = pattern.test(value);
   pattern.lastIndex = prevLastIndex;
   return matched;
}
