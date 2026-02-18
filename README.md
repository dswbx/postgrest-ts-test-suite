# postgrest-test-suite

Extracted PostgREST test cases as JSON, runnable with bun:test.

## Run the example (top-to-bottom)

```bash
bun install
bun run example/run.ts
```

What `bun run example/run.ts` does:

1. Starts Postgres + PostgREST with `example/docker-compose.yml`
2. Downloads and loads PostgREST fixture SQL (`example/setup.ts`)
3. Runs `example/postgrest.test.ts`
4. Tears everything down

Requirements:

- `docker` (with Compose support)
- `gh` (GitHub CLI, used to fetch fixture SQL)
- `psql` (PostgreSQL client)
- `bun`

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

## Development

### Setup

```bash
bun install
```
