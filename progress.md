# Progress

## Completed

### Phase 1: Extraction Parser ✓
- Built `extract/parser.ts` — line-oriented state machine for Haskell→JSON
- Built `extract/helpers.ts` — method/header/matcher resolution
- Built `extract/run.ts` — CLI runner
- Fixed: comment removal inside string literals (double-dash in URLs)
- Fixed: escaped quotes in paths (`\"` inside Haskell strings)
- Fixed: describe/context stack not popping for sibling `it` blocks
- Fixed: `rangeHdrs`/`rangeHdrsWithCount` outer paren stripping

### Phase 2: Test Runtime Infrastructure ✓
- `config.ts` — TestSuiteOptions, TestSpec, TestCase types
- `client.ts` — executeRequest (URL string or handler function)
- `matchers.ts` — expectResponse (status, body, headers assertions)
- `fixtures/loader.ts` — dialect-aware SQL fixture loader (postgres via psql, sqlite via bun:sqlite)
- `register.ts` — JSON→bun:test describe/it registration with nesting
- `index.ts` — main export: definePostgrestTests()
- Smoke tests pass (3/3)

### Phase 3: P0 Core Reads Extraction ✓
Extracted 501 tests, 20 flagged across 5 spec files:

| Spec | Extracted | Flagged |
|------|-----------|---------|
| QuerySpec | 299 | 4 |
| AndOrParamsSpec | 73 | 0 |
| JsonOperatorSpec | 65 | 0 |
| RangeSpec | 45 | 6 |
| SingularSpec | 19 | 10 |

Flagged reasons: liftIO (custom assertions), multi-shouldRespondWith with mutations (rollback verification)

Validation: 35 structural integrity tests pass.

## Not Started
- Phase 4: P1 Embeds
- Phase 5: P2 Mutations
- Phase 6: P3 RPC
- Phase 7: P4 Nice-to-have
- Phase 8: Flagged test manual port

## Key Learnings

### Parser
- Haskell `--` comment removal must skip inside string literals and [json|...|] blocks
- Regex path matching needs `((?:[^"\\\\]|\\\\.)*)` for escaped quotes
- describe/context stack must pop for both siblings AND `it` blocks at same indent
- `rangeHdrs $ ByteRangeFromTo 0 1` comes wrapped in parens when used as function argument — strip outer parens before resolving
- Multi-shouldRespondWith `do` blocks: safe to split if all requests are GET; flag if mixed methods
- Some upstream PostgREST paths lack leading `/` (e.g. `tsearch_to_tsvector?...`)

### Runtime
- `registerSpecs` nests `describe` blocks by walking the description array depth
- bun:test doesn't allow `describe()` inside `it()` — tests must be registered at top level
- `expectResponse` reads body as text then parses — Response body can only be consumed once

### Upstream PostgREST patterns
- `let` bindings in describe blocks (e.g. SingularSpec's `singular` header)
- Config mapping from Main.hs: most P0 specs use `withApp` = default config
- `mempty` = empty body, `""` = empty string body
- `[json|...|]` supports relaxed JSON (unquoted keys like `{ address: "foo" }`)
