import { loadFixtures, definePostgrestTests } from "postgres-test-suite";
import {
   randomPort,
   waitForPostgres,
   waitForHealthy,
   analyzeTables,
   startPostgrestContainer,
   detectUnavailableExtensions,
} from "./utils.ts";

const pgPort = randomPort();
const postgrestPort = randomPort();
const pgUrl = `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
let pgserveProc: ReturnType<typeof Bun.spawn> | null = null;

console.log(`Starting pgserve on port ${pgPort}...`);
pgserveProc = Bun.spawn(["npx", "pgserve", "--port", String(pgPort)], {
   stdout: "ignore",
   stderr: "ignore",
});

console.log("Waiting for postgres...", pgUrl);
await waitForPostgres(pgUrl);

console.log("Detecting extensions...");
const unavailable = await detectUnavailableExtensions(pgUrl);
if (unavailable.size > 0) {
   console.log(`Unavailable extensions: ${[...unavailable].join(", ")}`);
}

console.log("Loading fixtures...");
await loadFixtures({
   pgUrl,
   unavailableExtensions: unavailable,
});

console.log("Analyzing stats...");
await analyzeTables("127.0.0.1", pgPort);

console.log(`Starting PostgREST on port ${postgrestPort}...`);
const stopPostgrest = await startPostgrestContainer(
   "postgrest-test-pgserve",
   postgrestPort,
   pgPort
);

const postgrestUrl = `http://127.0.0.1:${postgrestPort}`;

console.log("Waiting for PostgREST...");
await waitForHealthy(`${postgrestUrl}/`, 60, 2000);

console.log("Running tests...");

definePostgrestTests({
   target: postgrestUrl,
   skipTests: [
      // postgis extension — tables/functions don't exist
      /shops|shop_bles/,
      /get_shop/,
      /lines/,
      /twkb/,
      /geo2json/,
      /geojson/,
      /bom_csv/,
      // ltree extension
      /ltree_sample/,
      /number_of_labels/,
      // isn extension
      /isn_sample/,
      /is_valid_isbn/,
      // file_fdw extension
      /projects_dump/,
      // German text search stemming differs from Docker PG (different locale/dictionaries)
      /tsvector columns/,
      /phraseto_tsquery/,
      /can handle fts on text and json columns/,
      /can handle wfts/,
      // pgserve uses system timezone instead of UTC
      /Data representations/,
   ],
   teardown: async () => {
      console.log("Tearing down...");
      await stopPostgrest();
      if (pgserveProc) {
         pgserveProc.kill();
         await pgserveProc.exited;
      }
   },
});
