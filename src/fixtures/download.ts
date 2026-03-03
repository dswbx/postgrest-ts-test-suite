// Downloads PostgREST fixture SQL from GitHub into fixtures/sql/

import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";

const REPO = "PostgREST/postgrest";
const FIXTURES_REF = process.env.POSTGREST_FIXTURES_REF ?? "main";
const FIXTURES_PATH = "test/spec/fixtures";
const FIXTURES_DIR = new URL("./sql/", import.meta.url).pathname;

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
  console.log(`Fixtures downloaded (ref: ${FIXTURES_REF})`);
}

downloadFixtures();
