// Downloads PostgREST fixture SQL from GitHub and loads into postgres

import { $ } from "bun";

const REPO = "PostgREST/postgrest";
const FIXTURES_PATH = "test/spec/fixtures";
const FIXTURES_DIR = new URL("./fixtures/", import.meta.url).pathname;

const SQL_FILES = [
  "database.sql",
  "roles.sql",
  "schema.sql",
  "jwt.sql",
  "jsonschema.sql",
  "privileges.sql",
  "data.sql",
];

async function downloadFixtures() {
  const { mkdirSync, existsSync } = require("node:fs");
  if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });

  for (const file of SQL_FILES) {
    const dest = `${FIXTURES_DIR}${file}`;
    if (existsSync(dest)) continue;
    console.log(`Downloading ${file}...`);
    const content =
      await $`gh api repos/${REPO}/contents/${FIXTURES_PATH}/${file} --jq .content`.text();
    const decoded = Buffer.from(content.trim(), "base64").toString("utf-8");
    await Bun.write(dest, decoded);
  }
}

async function loadFixtures(
  host = "localhost",
  port = 5432,
  user = "postgres",
  password = "postgres",
  database = "postgres"
) {
  const pgUrl = `postgres://${user}:${password}@${host}:${port}/${database}`;

  for (const file of SQL_FILES) {
    console.log(`Loading ${file}...`);
    await $`psql ${pgUrl} -f ${FIXTURES_DIR}${file} -v ON_ERROR_STOP=1`.quiet();
  }
}

export async function setupFixtures(opts?: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}) {
  await downloadFixtures();
  await loadFixtures(
    opts?.host,
    opts?.port,
    opts?.user,
    opts?.password,
    opts?.database
  );
}
