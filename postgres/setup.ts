// Downloads PostgREST fixture SQL from GitHub and loads into postgres

import { $ } from "bun";

const REPO = "PostgREST/postgrest";
const FIXTURES_REF = process.env.POSTGREST_FIXTURES_REF ?? "main";
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
  const { mkdirSync, existsSync, readFileSync, unlinkSync } = require("node:fs");
  if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
  const refMarkerPath = `${FIXTURES_DIR}.ref`;
  const currentRef = existsSync(refMarkerPath)
    ? readFileSync(refMarkerPath, "utf8").trim()
    : null;

  if (currentRef !== FIXTURES_REF) {
    for (const file of SQL_FILES) {
      const dest = `${FIXTURES_DIR}${file}`;
      if (existsSync(dest)) unlinkSync(dest);
    }
  }

  for (const file of SQL_FILES) {
    const dest = `${FIXTURES_DIR}${file}`;
    if (existsSync(dest)) continue;
    console.log(`Downloading ${file}...`);
    const content =
      await $`gh api repos/${REPO}/contents/${FIXTURES_PATH}/${file}?ref=${FIXTURES_REF} --jq .content`.text();
    const decoded = Buffer.from(content.trim(), "base64").toString("utf-8");
    await Bun.write(dest, decoded);
  }

  await Bun.write(refMarkerPath, `${FIXTURES_REF}\n`);
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
    await $`psql ${pgUrl} -f ${FIXTURES_DIR}${file} -v ON_ERROR_STOP=1 -v PGUSER=${user} -v DBNAME=${database}`.quiet();
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
