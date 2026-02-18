# PostgREST Test Suite

Extracts PostgREST Haskell test cases → JSON, runs them with bun:test via Fetch API.

## Commands

```bash
bun run extract/run.ts ./upstream/ ./specs/   # extract test cases
bun test                                       # run tests
bun run tsc --noEmit                           # typecheck
```

## Code style

- TypeScript, ES modules, strict mode
- Use Bun APIs (bun:test, Bun.file, Bun.sql, bun:sqlite) — no node-specific APIs
- No classes unless necessary; prefer plain functions + types
- Keep files focused: one concern per file

## Architecture

- `extract/` — one-time Haskell→JSON parser (line-oriented state machine)
- `specs/` — generated JSON test cases (don't hand-edit)
- `fixtures/` — SQL fixtures per dialect (postgres/, sqlite/)
- Root TS files (client.ts, matchers.ts, register.ts, config.ts, index.ts) — test runtime

## Testing

- Run single spec files during dev: `bun test specs/query`
- JSON test format defined in postgrest-test-plan.md
- Parser correctness: compare extracted JSON against manual reading of Haskell source

## Key decisions

- `target` can be URL string (fetch) or handler function (direct call)
- Tests grouped by `config` value (server configuration variant)
- Complex tests (liftIO, multi-request, lambdas) flagged to `_flagged.json`, not extracted
