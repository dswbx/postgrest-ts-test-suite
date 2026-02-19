# postgrest-test-suite

Extracted PostgREST test suite with 498 test cases and 1428 assertions as JSON, runnable with bun:test.

## Verify the port 

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

Output:

```
$ bun run postgres/run.ts
[...]
postgres/postgrest.test.ts:
[...]
(pass) JsonOperator > json array negative index > can filter with negative indexes (3) [1.39ms]
(pass) JsonOperator > json array negative index > can filter with negative indexes (4) [1.22ms]

 498 pass
 0 fail
 1428 expect() calls
Ran 498 tests across 1 file. [1258.00ms]
```

## Usage

Make sure to link `postgrest-test-suite`, then add the link to your project's `package.json`:

```bash
bun link
```

```json
"devDependencies": {
  "postgrest-test-suite": "link:postgrest-test-suite"
}
```

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
  skip: ["postgis", /unicode/i],
  only: ["query", "range"],
  skipTests: ["some substring to skip", /legacy endpoint/i],
  skipConfigs: ["max-rows", /plan-enabled/],
});
```
