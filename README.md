# postgrest-test-suite

Extracted PostgREST test cases as JSON, runnable with bun:test.

## Setup

```bash
bun install
```

## Extract test cases from upstream Haskell source

Downloads PostgREST spec files and converts them to JSON:

```bash
# 1. Download spec files (requires gh CLI)
mkdir -p upstream
for f in QuerySpec.hs AndOrParamsSpec.hs JsonOperatorSpec.hs RangeSpec.hs SingularSpec.hs; do
  gh api repos/PostgREST/postgrest/contents/test/spec/Feature/Query/$f \
    -H "Accept: application/vnd.github.raw+json" > upstream/$f
done
# Also grab Main.hs and SpecHelper.hs for config/helper resolution
for f in Main.hs SpecHelper.hs; do
  gh api repos/PostgREST/postgrest/contents/test/spec/$f \
    -H "Accept: application/vnd.github.raw+json" > upstream/$f
done

# 2. Run extraction
bun run extract/run.ts ./upstream/ ./specs/
```

Output goes to `specs/` as JSON files + `_flagged.json` + `_stats.json`.

## Use in your project

```typescript
// my-project/test/postgrest.test.ts
import { definePostgrestTests } from "postgrest-test-suite";
import { loadMyFixtures } from "./helpers";

definePostgrestTests({
  // URL string for real HTTP, or handler function for direct calls
  target: "http://localhost:3000",
  // target: app.fetch,  // Bun.serve handler

  // optional: runs once before all tests (DB setup, migrations, seeding, etc.)
  setup: async () => {
    await loadMyFixtures();
  },

  // optional filters
  skip: ["postgis", "unicode"],
  only: ["query", "range"],
  skipTests: ["some substring to skip"],
  skipConfigs: ["max-rows", "plan-enabled"],
});
```

## Run tests

```bash
bun test                        # all tests
bun test test/smoke.test.ts     # runtime smoke tests
bun test test/extraction.test.ts # validate extracted JSON
```

## Project structure

```
extract/          Haskell→JSON parser (one-time extraction)
specs/            Generated JSON test cases (don't hand-edit)
fixtures/         SQL fixtures per dialect (postgres/, sqlite/)
config.ts         TestSuiteOptions type
client.ts         Fetch API request builder
matchers.ts       bun:test assertion helpers
register.ts       JSON → bun:test describe/it registration
index.ts          Main export: definePostgrestTests()
```
