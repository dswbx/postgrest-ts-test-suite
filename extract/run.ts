#!/usr/bin/env bun
// CLI: reads .hs files from upstream/, writes JSON to specs/

import { parseSpecFile, type ParseResult, type FlaggedTest } from "./parser.ts";
import { parseConfigMap } from "./helpers.ts";

const args = process.argv.slice(2);
const upstreamDir = args[0] || "./upstream";
const outputDir = args[1] || "./specs";

// Ensure output directory exists
const { mkdirSync, existsSync } = await import("node:fs");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

// Read Main.hs for config mapping
const mainHsPath = `${upstreamDir}/Main.hs`;
let configMap = new Map<string, string>();
const mainFile = Bun.file(mainHsPath);
if (await mainFile.exists()) {
  const mainHs = await mainFile.text();
  configMap = parseConfigMap(mainHs);
}

// Find all spec files
const { readdirSync } = await import("node:fs");
const specFiles = readdirSync(upstreamDir)
  .filter((f: string) => f.endsWith("Spec.hs"))
  .sort();

const allFlagged: (FlaggedTest & { file: string })[] = [];
const stats = {
  totalFiles: 0,
  totalTests: 0,
  totalFlagged: 0,
  files: [] as { name: string; tests: number; flagged: number }[],
};

for (const file of specFiles) {
  const path = `${upstreamDir}/${file}`;
  const source = await Bun.file(path).text();

  // Determine config for this spec
  const specName = file.replace(/\.hs$/, "");
  let config = "default";

  // Check configMap — try various key formats
  for (const [key, val] of configMap) {
    if (key.includes(specName) || key.includes(specName.replace("Spec", ""))) {
      config = val;
      break;
    }
  }

  const result = parseSpecFile(file, source, config);

  // Write spec JSON
  const outName = specName
    .replace(/Spec$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
  const outPath = `${outputDir}/${outName}.json`;

  await Bun.write(
    outPath,
    JSON.stringify(
      { file: result.file, config: result.config, tests: result.tests },
      null,
      2
    )
  );

  // Collect flagged
  for (const f of result.flagged) {
    allFlagged.push({ ...f, file: specName });
  }

  stats.totalFiles++;
  stats.totalTests += result.tests.length;
  stats.totalFlagged += result.flagged.length;
  stats.files.push({
    name: specName,
    tests: result.tests.length,
    flagged: result.flagged.length,
  });

  console.log(
    `${specName}: ${result.tests.length} tests, ${result.flagged.length} flagged`
  );
}

// Write flagged tests
await Bun.write(
  `${outputDir}/_flagged.json`,
  JSON.stringify(allFlagged, null, 2)
);

// Write stats
await Bun.write(`${outputDir}/_stats.json`, JSON.stringify(stats, null, 2));

console.log(`\nTotal: ${stats.totalTests} tests, ${stats.totalFlagged} flagged across ${stats.totalFiles} files`);
