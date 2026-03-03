import {
   randomPort,
   waitForPostgres,
   waitForHealthy,
   analyzeTables,
   startPostgresContainer,
   startPostgrestContainer,
} from "./utils.ts";
import { definePostgrestTests, loadFixtures } from "postgres-test-suite";

const pgPort = randomPort();
const postgrestPort = randomPort();
const pgUrl = `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`;

console.log(`Starting postgres on port ${pgPort}...`);
const stopPostgres = await startPostgresContainer(
   "postgrest-test-postgres",
   pgPort
);

console.log("Waiting for postgres...");
await waitForPostgres(pgUrl);

console.log("Loading fixtures...");
await loadFixtures({
   pgUrl,
   user: "postgres",
   database: "postgres",
});

console.log("Analyzing stats...");
await analyzeTables("127.0.0.1", pgPort);

console.log(`Starting PostgREST on port ${postgrestPort}...`);
const stopPostgrest = await startPostgrestContainer(
   "postgrest-test-postgrest",
   postgrestPort,
   pgPort
);

const postgrestUrl = `http://127.0.0.1:${postgrestPort}`;

console.log("Waiting for PostgREST...");
await waitForHealthy(`${postgrestUrl}/`, 60, 2000);

console.log("Running tests...");
process.env.POSTGREST_URL = postgrestUrl;
process.env.PGHOST = "127.0.0.1";
process.env.PGPORT = String(pgPort);

definePostgrestTests({
   target: postgrestUrl,
   teardown: async () => {
      console.log("Tearing down...");
      await stopPostgrest();
      await stopPostgres();
   },
});
