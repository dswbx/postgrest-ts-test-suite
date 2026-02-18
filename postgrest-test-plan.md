# PostgREST Test Suite Port — Plan

Extract PostgREST's Haskell test cases into JSON, run them with bun:test via Fetch API.

## Architecture

```
postgrest-test-suite/
├── extract/                  # one-time extraction tooling
│   ├── parser.ts             # Haskell spec → JSON parser
│   ├── helpers.ts            # resolve hspec-wai helpers (acceptHdrs, authHeaderJWT, etc.)
│   └── run.ts                # CLI: reads .hs files, writes JSON to specs/
├── fixtures/
│   ├── postgres/             # verbatim from PostgREST test/spec/fixtures/
│   │   ├── schema.sql
│   │   ├── data.sql
│   │   ├── roles.sql
│   │   ├── privileges.sql
│   │   ├── jwt.sql
│   │   └── jsonschema.sql
│   ├── sqlite/               # user-maintained equivalents
│   │   ├── schema.sql
│   │   └── data.sql
│   └── loader.ts             # dialect-aware: picks dir, runs SQL
├── specs/                    # generated JSON test cases
│   ├── query.json
│   ├── and-or-params.json
│   ├── embed-disambiguation.json
│   ├── insert.json
│   ├── rpc.json
│   └── ...
├── client.ts                 # Fetch API request builder
├── matchers.ts               # bun:test assertion helpers
├── config.ts                 # TestSuiteOptions type
├── register.ts               # JSON → bun:test describe/it registration
└── index.ts                  # main export: definePostgrestTests(options)
```

## Config API

```typescript
interface TestSuiteOptions {
  // URL string → makes real HTTP requests via fetch()
  // Handler fn → calls directly (e.g. Bun.serve's fetch handler)
  target: string | ((req: Request) => Response | Promise<Response>);

  db: {
    dialect: "postgres" | "sqlite";
    // postgres: "postgres://user:pass@host/db"
    // sqlite: "/path/to/file.db"
    url: string;
  };

  // skip test files by name, e.g. ["postgis", "unicode", "aggregate-functions"]
  skip?: string[];

  // only run these, e.g. ["query", "insert"]
  only?: string[];

  // skip individual tests by description substring
  skipTests?: string[];
}
```

User's test file:

```typescript
// my-project/test/postgrest.test.ts
import { definePostgrestTests } from "postgrest-test-suite";
import { app } from "../src/app";

definePostgrestTests({
  target: app.fetch,  // or "http://localhost:3000" for real PostgREST
  db: { dialect: "postgres", url: process.env.DATABASE_URL! },
  skip: ["postgis", "unicode"],
});
```

## JSON Test Case Format

```json
{
  "file": "QuerySpec",
  "config": "default",
  "tests": [
    {
      "description": ["Querying a table", "with a simple read", "returns all rows"],
      "request": {
        "method": "GET",
        "path": "/items",
        "headers": [],
        "body": null
      },
      "expected": {
        "status": 200,
        "body": [{"id": 1}, {"id": 2}],
        "bodyExact": true,
        "headers": [
          ["Content-Type", "application/json; charset=utf-8"],
          ["Content-Range", "0-1/*"]
        ],
        "headersAbsent": [],
        "headersContain": []
      }
    }
  ]
}
```

Fields:
- `description`: array from nested describe/context/it — joined with " > " for bun:test
- `config`: which server config this test needs ("default", "max-rows-2", "no-anon", "plan-enabled", "aggregates-enabled", etc.)
- `body`: parsed JSON (object/array) or raw string. `null` = no body assertion
- `bodyExact`: true = deep equal, false = subset match
- `headers`: array of [name, value] pairs — exact string match
- `headersAbsent`: header names that must NOT be present
- `headersContain`: [name, substring] pairs — substring match

Tests grouped by `config` value. Runner creates a `describe` block per config, user can skip configs they don't support.

## Extraction Parser

### Patterns to parse

The parser is a line-oriented state machine. 90%+ of tests follow these exact patterns:

**1. Simple GET**
```haskell
it "description" $
  get "/path"
  `shouldRespondWith` [json|...|]
  { matchStatus = 200 }
```

**2. Full request**
```haskell
it "description" $
  request methodDelete "/path?q=1"
    [("Prefer", "return=representation"), ("Accept", "application/json")]
    [json|{"key":"val"}|]
  `shouldRespondWith`
    [json|[{"id":1}]|]
    { matchStatus = 200
    , matchHeaders = ["Content-Range" <:> "*/1"]
    }
```

**3. Body-only assertion**
```haskell
`shouldRespondWith` [json|...|]
```
(no `{ matchStatus = ... }` block → status defaults to 200)

**4. Status-only assertion**
```haskell
`shouldRespondWith` ""
{ matchStatus = 204
, matchHeaders = [matchHeaderAbsent hContentType]
}
```

### Header helper resolution

Parser must expand these SpecHelper functions:

| Haskell | Expands to |
|---|---|
| `acceptHdrs "text/csv"` | `[["Accept", "text/csv"]]` |
| `authHeaderJWT "token"` | `[["Authorization", "Bearer token"]]` |
| `rangeHdrs (ByteRangeFromTo 0 4)` | `[["Range-Unit", "items"], ["Range", "0-4"]]` |
| `planHdr` | `[["Accept", "application/vnd.pgrst.plan+json"]]` |

### Method resolution

| Haskell | Method |
|---|---|
| `get` | GET |
| `post` | POST |
| `patch` | PATCH |
| `methodDelete` | DELETE |
| `methodPut` | PUT |
| `methodHead` | HEAD |
| `methodOptions` | OPTIONS |

### Header matcher resolution

| Haskell | JSON |
|---|---|
| `"Content-Type" <:> "application/json"` | `["Content-Type", "application/json"]` in `headers` |
| `matchHeaderAbsent hContentType` | `"Content-Type"` in `headersAbsent` |
| `matchContentTypeJson` | `["Content-Type", "application/json; charset=utf-8"]` |
| `matchContentTypeSingular` | `["Content-Type", "application/vnd.pgrst.object+json; charset=utf-8"]` |

### Complex test detection

Flag (don't extract) tests that contain:
- `liftIO` — side-effect setup/teardown
- Multiple `shouldRespondWith` in one `it` — sequential requests
- `pendingWith` — already skipped upstream
- `\_ ->` lambda patterns — custom logic
- `analyzeTable` — requires psql shell-out

Output flagged tests to `specs/_flagged.json` with source location + reason. These get manually ported later.

## Phases

### Phase 1: Extraction parser (~2-3 days)

1. **Haskell source fetcher** — download PostgREST spec files from GitHub via `gh` CLI to a local `upstream/` directory
2. **Tokenizer** — line-oriented scanner that identifies `describe`, `context`, `it`, `get`, `post`, `request`, `` `shouldRespondWith` ``, `[json|...|]`, `{ matchStatus`, `matchHeaders` blocks
3. **JSON quasiquoter extractor** — extract content between `[json|` and `|]`, handle multi-line, parse as JSON
4. **Header/method resolver** — expand known helpers to concrete values
5. **Config tagger** — read `Main.hs` to map which spec files use which config (e.g. `before maxRowsApp` → config "max-rows-2")
6. **Complex test flagger** — detect patterns that can't be auto-extracted
7. **CLI runner** — `bun run extract/run.ts upstream/ specs/` → generates all JSON files + `_flagged.json` + `_stats.json`

### Phase 2: Test runtime infrastructure (~2 days)

1. **`client.ts`** — takes `TestSuiteOptions.target`, constructs `Request` objects from test case JSON, calls target
   - If target is string: `fetch(new Request(target + path, { method, headers, body }))`
   - If target is function: `target(new Request("http://localhost" + path, { method, headers, body }))`

2. **`matchers.ts`** — bun:test assertion wrappers:
   - `expectStatus(response, expected)` — `expect(res.status).toBe(n)`
   - `expectBody(response, expected, exact)` — deep-equal or subset match on parsed JSON
   - `expectHeaders(response, headers, absent, contains)` — header assertions
   - `expectResponse(response, expected)` — all-in-one

3. **`fixtures/loader.ts`**:
   - Reads `db.dialect` from options
   - Loads SQL files from `fixtures/{dialect}/`
   - For postgres: uses `pg` or Bun's postgres client
   - For sqlite: uses `bun:sqlite` or `better-sqlite3`
   - Runs: roles → schema → jwt → jsonschema → privileges → data (in order)
   - Exposes `loadFixtures(options)` and `teardownFixtures(options)`

4. **`register.ts`** — reads JSON spec files, registers bun:test cases:
   ```typescript
   for (const spec of specFiles) {
     describe(spec.file, () => {
       for (const test of spec.tests) {
         const name = test.description.join(" > ");
         it(name, async () => {
           const res = await client.request(test.request);
           expectResponse(res, test.expected);
         });
       }
     });
   }
   ```

5. **`config.ts`** — `TestSuiteOptions` type, defaults, validation

6. **`index.ts`** — `definePostgrestTests(options)`: loads fixtures (once via `beforeAll`), registers all specs

### Phase 3: P0 — Core reads & filtering (~361 tests, ~2 days)

Extract and validate:

| Source spec | JSON output | Tests |
|---|---|---|
| `QuerySpec.hs` | `query.json` | ~212 |
| `AndOrParamsSpec.hs` | `and-or-params.json` | ~41 |
| `JsonOperatorSpec.hs` | `json-operator.json` | ~37 |
| `RangeSpec.hs` | `range.json` | ~43 |
| `SingularSpec.hs` | `singular.json` | ~28 |

Validate: run extracted tests against real PostgREST to confirm they pass. Fix any parser issues.

### Phase 4: P1 — Embeds (~137 tests, ~1.5 days)

| Source spec | JSON output | Tests |
|---|---|---|
| `EmbedDisambiguationSpec.hs` | `embed-disambiguation.json` | ~43 |
| `EmbedInnerJoinSpec.hs` | `embed-inner-join.json` | ~20 |
| `RelatedQueriesSpec.hs` | `related-queries.json` | ~17 |
| `SpreadQueriesSpec.hs` | `spread-queries.json` | ~43 |
| `ComputedRelsSpec.hs` | `computed-rels.json` | ~14 |

### Phase 5: P2 — Mutations (~187 tests, ~1.5 days)

| Source spec | JSON output | Tests |
|---|---|---|
| `InsertSpec.hs` | `insert.json` | ~74 |
| `UpdateSpec.hs` | `update.json` | ~54 |
| `DeleteSpec.hs` | `delete.json` | ~14 |
| `UpsertSpec.hs` | `upsert.json` | ~45 |

Note: mutation tests may have more `liftIO`/sequential patterns (insert then verify). Expect higher flagged-test rate (~15-20%). Manual port for those.

### Phase 6: P3 — RPC (~152 tests, ~1.5 days)

| Source spec | JSON output | Tests |
|---|---|---|
| `RpcSpec.hs` | `rpc.json` | ~152 |

### Phase 7: P4 — Nice-to-have (~199 tests, ~2 days)

| Source spec | JSON output | Tests |
|---|---|---|
| `AggregateFunctionsSpec.hs` | `aggregate-functions.json` | ~41 |
| `PlanSpec.hs` | `plan.json` | ~43 |
| `PreferencesSpec.hs` | `preferences.json` | ~25 |
| `QueryLimitedSpec.hs` | `query-limited.json` | ~12 |
| `NullsStripSpec.hs` | `nulls-strip.json` | ~7 |
| `PgSafeUpdateSpec.hs` | `pg-safe-update.json` | ~6 |
| `PostGISSpec.hs` | `postgis.json` | ~12 |
| `CustomMediaSpec.hs` | `custom-media.json` | ~42 |
| `ErrorSpec.hs` | `error.json` | ~7 |
| `RawOutputTypesSpec.hs` | `raw-output-types.json` | ~4 |
| `MultipleSchemaSpec.hs` | `multiple-schema.json` | ~31 |
| `ServerTimingSpec.hs` | `server-timing.json` | ~8 |
| `RollbackSpec.hs` | `rollback.json` | ~14 |
| `CorsSpec.hs` | `cors.json` | ~3 |
| `OptionsSpec.hs` | `options.json` | ~15 |

### Phase 8: Flagged test manual port (~1-2 days)

Review `_flagged.json`. For each:
- Trivial ones (just a `pendingWith`): skip
- Sequential request tests: write as manual bun:test cases in `specs/manual/`
- Complex setup tests: evaluate if relevant, port or skip

## Effort Summary

| Phase | Scope | Tests | Days |
|---|---|---|---|
| 1. Extraction parser | parser + CLI | — | 2-3 |
| 2. Test runtime | client, matchers, fixtures, register | — | 2 |
| 3. P0 core reads | QuerySpec, AndOr, JsonOp, Range, Singular | ~361 | 2 |
| 4. P1 embeds | Disambiguation, InnerJoin, Related, Spread, Computed | ~137 | 1.5 |
| 5. P2 mutations | Insert, Update, Delete, Upsert | ~187 | 1.5 |
| 6. P3 RPC | RpcSpec | ~152 | 1.5 |
| 7. P4 nice-to-have | 15 remaining specs | ~199 | 2 |
| 8. Flagged manual port | complex/sequential tests | ~50-100 | 1-2 |
| **Total** | | **~1,036 + flagged** | **~14-18** |

## SQL Fixture Strategy

- `fixtures/postgres/` — copy verbatim from PostgREST `test/spec/fixtures/`
- `fixtures/sqlite/` — user maintains. Same logical schema, SQLite syntax. Missing features (PostGIS, custom domains, triggers, partitions, FDW) → those test files get auto-skipped
- `loader.ts` detects dialect, loads correct directory, runs files in dependency order
- Each test run: drop + recreate DB (or use a template DB on postgres for speed)

## Running

```bash
# one-time: extract test cases from upstream Haskell source
bun run extract/run.ts ./upstream/ ./specs/

# run against your TS implementation
bun test

# run against real PostgREST (set env var)
POSTGREST_TEST_TARGET=http://localhost:3000 bun test

# run subset
POSTGREST_TEST_ONLY=query,insert bun test
```

## Unresolved Questions

- Mutation tests: need DB state reset between tests? PostgREST uses tx rollback — what's the strategy for the TS impl?
- Config variants: how does the TS impl expose config changes? (env vars? constructor options? multiple instances?)
- `jsonschema.sql` and `jwt.sql` — these define PG functions used in some tests. Relevant for SQLite?
- Should extracted JSON be committed to the repo or re-generated from upstream each time?
