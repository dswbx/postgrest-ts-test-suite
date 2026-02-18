import { definePostgrestTests } from "../test/lib/index.ts";
import { setupFixtures } from "./setup.ts";

const rawTarget = process.env.POSTGREST_URL ?? "http://localhost:3000";
const target = rawTarget.endsWith("/") ? rawTarget : `${rawTarget}/`;
const pgHost = process.env.PGHOST ?? "localhost";
const pgPort = process.env.PGPORT ? Number(process.env.PGPORT) : 5432;
const shouldSetupFixtures = process.env.POSTGREST_FIXTURES_READY !== "1";

definePostgrestTests({
   target,
   setup: shouldSetupFixtures
      ? () => setupFixtures({ host: pgHost, port: pgPort })
      : undefined,
});
