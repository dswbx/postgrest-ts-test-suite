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

async function main() {
  try {
    console.log("Starting docker compose...");
    await $`docker compose -f ${DIR}docker-compose.yml up -d`.quiet();

    console.log("Waiting for PostgREST...");
    await waitForHealthy("http://localhost:3000/");

    console.log("Loading fixtures...");
    const { setupFixtures } = await import("./setup.ts");
    await setupFixtures();

    console.log("Running tests...");
    const result =
      await $`bun test ${DIR}postgrest.test.ts`.nothrow();
    process.exit(result.exitCode);
  } finally {
    console.log("Tearing down...");
    await $`docker compose -f ${DIR}docker-compose.yml down`.quiet();
  }
}

main();
