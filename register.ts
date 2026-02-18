// Reads JSON spec files, registers bun:test cases

import { describe, it } from "bun:test";
import type { TestSuiteOptions, TestSpec } from "./config.ts";
import { executeRequest } from "./client.ts";
import { expectResponse } from "./matchers.ts";

export function registerSpecs(
  specs: TestSpec[],
  options: TestSuiteOptions
) {
  for (const spec of specs) {
    // Skip by config
    if (options.skipConfigs?.includes(spec.config)) continue;

    describe(spec.file, () => {
      // Group tests by their top-level description
      const groups = new Map<string, typeof spec.tests>();

      for (const test of spec.tests) {
        const topDesc = test.description[0] ?? spec.file;
        if (!groups.has(topDesc)) groups.set(topDesc, []);
        groups.get(topDesc)!.push(test);
      }

      for (const [groupName, tests] of groups) {
        registerGroup(groupName, tests, 1, options);
      }
    });
  }
}

function registerGroup(
  name: string,
  tests: { description: string[] }[],
  depth: number,
  options: TestSuiteOptions
) {
  // Find tests at this depth and deeper
  const atThisLevel = tests.filter((t) => t.description.length === depth + 1);
  const deeper = tests.filter((t) => t.description.length > depth + 1);

  // Group deeper tests by next description level
  const subGroups = new Map<string, typeof tests>();
  for (const t of deeper) {
    const key = t.description[depth]!;
    if (!subGroups.has(key)) subGroups.set(key, []);
    subGroups.get(key)!.push(t);
  }

  describe(name, () => {
    for (const test of atThisLevel) {
      const testName = test.description[test.description.length - 1]!;
      const tc = test as any;

      // Skip by description substring
      const fullDesc = tc.description.join(" > ");
      if (options.skipTests?.some((s: string) => fullDesc.includes(s))) {
        it.skip(testName, () => {});
        continue;
      }

      it(testName, async () => {
        const res = await executeRequest(options.target, tc.request);
        await expectResponse(res, tc.expected);
      });
    }

    for (const [subName, subTests] of subGroups) {
      registerGroup(subName, subTests, depth + 1, options);
    }
  });
}
