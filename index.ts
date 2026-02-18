// Main export: definePostgrestTests(options)

import { beforeAll } from "bun:test";
import type { TestSuiteOptions, TestSpec } from "./config.ts";
import { registerSpecs } from "./register.ts";

export type { TestSuiteOptions, TestSpec } from "./config.ts";
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
  const specsDir = new URL("./specs/", import.meta.url).pathname;

  // Read all JSON files from specs/
  const { readdirSync } = require("node:fs");
  let files: string[];
  try {
    files = readdirSync(specsDir).filter(
      (f: string) => f.endsWith(".json") && !f.startsWith("_")
    );
  } catch {
    console.warn(`No specs directory found at ${specsDir}`);
    return [];
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
        !options.skip!.some((name) =>
          s.file.toLowerCase().includes(name.toLowerCase())
        )
    );
  }

  return specs;
}
