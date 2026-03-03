import { $ } from "bun";

export function randomPort() {
   return 10000 + Math.floor(Math.random() * 50000);
}

export async function waitForPostgres(
   pgUrl: string,
   maxRetries = 30,
   intervalMs = 1000
) {
   for (let i = 0; i < maxRetries; i++) {
      const result = await $`psql ${pgUrl} -c "select 1" -v ON_ERROR_STOP=1`
         .quiet()
         .nothrow();
      if (result.exitCode === 0) return;
      await Bun.sleep(intervalMs);
   }
   throw new Error(`Timed out waiting for postgres at ${pgUrl}`);
}

export async function waitForHealthy(
   url: string,
   maxRetries = 30,
   intervalMs = 2000
) {
   for (let i = 0; i < maxRetries; i++) {
      try {
         const res = await fetch(url);
         if (res.ok) return;
      } catch {}
      await Bun.sleep(intervalMs);
   }
   throw new Error(`Timed out waiting for ${url}`);
}

export async function analyzeTables(
   host: string,
   port: number,
   user = "postgres",
   password = "postgres",
   database = "postgres"
) {
   const pgUrl = `postgres://${user}:${password}@${host}:${port}/${database}`;
   await $`psql ${pgUrl} -v ON_ERROR_STOP=1 -c 'ANALYZE test."items";'`.quiet();
   await $`psql ${pgUrl} -v ON_ERROR_STOP=1 -c 'ANALYZE test."child_entities";'`.quiet();
}

const POSTGRES_IMAGE = "postgis/postgis:17-3.4-alpine";
const POSTGREST_IMAGE = "postgrest/postgrest";

export async function startPostgresContainer(
   name: string,
   port: number
): Promise<() => Promise<void>> {
   await $`docker rm -f ${name}`.quiet().nothrow();
   await $`docker run -d --rm --name ${name} \
      -p 127.0.0.1:${port}:5432 \
      -e POSTGRES_PASSWORD=postgres \
      ${POSTGRES_IMAGE}`.quiet();

   return async () => {
      await $`docker rm -f ${name}`.quiet().nothrow();
   };
}

export async function startPostgrestContainer(
   name: string,
   postgrestPort: number,
   pgHostPort: number
): Promise<() => Promise<void>> {
   await $`docker rm -f ${name}`.quiet().nothrow();
   const dbUri = `postgres://postgres:postgres@host.docker.internal:${pgHostPort}/postgres`;
   await $`docker run -d --rm --name ${name} \
      -p 127.0.0.1:${postgrestPort}:3000 \
      -e PGRST_DB_URI=${dbUri} \
      -e PGRST_DB_SCHEMAS=test \
      -e PGRST_DB_ANON_ROLE=postgrest_test_anonymous \
      -e PGRST_JWT_SECRET=reallyreallyreallyreallyverysafe \
      -e PGRST_DB_PRE_REQUEST=test.switch_role \
      -e PGRST_DB_POOL=10 \
      -e PGRST_DB_POOL_ACQUISITION_TIMEOUT=10 \
      -e PGRST_SERVER_TIMING_ENABLED=true \
      -e PGRST_DB_TX_END=rollback-allow-override \
      -e PGRST_APP_SETTINGS_APP_HOST=localhost \
      -e "PGRST_APP_SETTINGS_EXTERNAL_API_SECRET=0123456789abcdef" \
      -e PGRST_LOG_LEVEL=crit \
      ${POSTGREST_IMAGE}`.quiet();

   return async () => {
      await $`docker rm -f ${name}`.quiet().nothrow();
   };
}

export async function detectAvailableExtensions(
   pgUrl: string
): Promise<Set<string>> {
   const result =
      await $`psql ${pgUrl} -t -A -c "SELECT name FROM pg_available_extensions"`.text();
   return new Set(
      result
         .trim()
         .split("\n")
         .map((s) => s.trim())
         .filter(Boolean)
   );
}

const KNOWN_EXTENSIONS = ["postgis", "ltree", "isn", "file_fdw"];

export async function detectUnavailableExtensions(
   pgUrl: string
): Promise<Set<string>> {
   const available = await detectAvailableExtensions(pgUrl);
   return new Set(KNOWN_EXTENSIONS.filter((ext) => !available.has(ext)));
}
