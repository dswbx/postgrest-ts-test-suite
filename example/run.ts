// Orchestrator: docker up → load fixtures → run tests → docker down

import { $ } from "bun";

const DIR = new URL("./", import.meta.url).pathname;

async function waitForHealthy(url: string, maxRetries = 30, intervalMs = 2000) {
   for (let i = 0; i < maxRetries; i++) {
      try {
         const res = await fetch(url);
         if (res.ok) return;
      } catch {}
      await Bun.sleep(intervalMs);
   }
   throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPostgres(
   host: string,
   port: number,
   user = "postgres",
   password = "postgres",
   database = "postgres",
   maxRetries = 30,
   intervalMs = 2000
) {
   const pgUrl = `postgres://${user}:${password}@${host}:${port}/${database}`;
   for (let i = 0; i < maxRetries; i++) {
      const result = await $`psql ${pgUrl} -c "select 1" -v ON_ERROR_STOP=1`
         .quiet()
         .nothrow();
      if (result.exitCode === 0) return;
      await Bun.sleep(intervalMs);
   }
   throw new Error(`Timed out waiting for postgres on ${host}:${port}`);
}

async function analyzeTables(
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

async function getPublishedPort(service: string, containerPort: number) {
   const output =
      await $`docker compose -f ${DIR}docker-compose.yml port ${service} ${containerPort}`.text();
   const endpoint = output.trim();
   const parts = endpoint.split(":");
   const port = Number(parts[parts.length - 1]);
   if (!Number.isInteger(port) || port <= 0) {
      throw new Error(
         `Could not parse published port for ${service}:${containerPort} from "${endpoint}"`
      );
   }
   return port;
}

async function main() {
   try {
      await $`docker compose -f ${DIR}docker-compose.yml down -v`.quiet().nothrow();

      console.log("Starting postgres...");
      await $`docker compose -f ${DIR}docker-compose.yml up -d postgres`.quiet();

      const postgresPort = await getPublishedPort("postgres", 5432);
      console.log("Ports:", {
         postgres: postgresPort,
      });

      console.log("Waiting for Postgres...");
      await waitForPostgres("127.0.0.1", postgresPort);

      console.log("Loading fixtures...");
      const { setupFixtures } = await import("./setup.ts");
      await setupFixtures({ host: "127.0.0.1", port: postgresPort });

      console.log("Analyzing stats...");
      await analyzeTables("127.0.0.1", postgresPort);

      console.log("Starting PostgREST...");
      await $`docker compose -f ${DIR}docker-compose.yml up -d postgrest`.quiet();
      const postgrestPort = await getPublishedPort("postgrest", 3000);
      const postgrestUrl = `http://127.0.0.1:${postgrestPort}`;
      console.log("Ports:", {
         postgrest: postgrestPort,
         postgres: postgresPort,
      });

      console.log("Waiting for PostgREST...");
      await waitForHealthy(`${postgrestUrl}/`, 60, 2000);

      console.log("Running tests...");
      process.env.POSTGREST_URL = postgrestUrl;
      process.env.PGHOST = "127.0.0.1";
      process.env.PGPORT = String(postgresPort);
      process.env.POSTGREST_FIXTURES_READY = "1";
      const result = await $`bun test ${DIR}postgrest.test.ts`.nothrow();
      process.exit(result.exitCode);
   } finally {
      console.log("Tearing down...");
      await $`docker compose -f ${DIR}docker-compose.yml down -v`.quiet();
   }
}

main();
