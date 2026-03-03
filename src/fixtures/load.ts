// Shared fixture loader: reads SQL files, optionally preprocesses, loads via psql

import { $ } from "bun";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterSQL } from "./preprocess.ts";

const SQL_FILES = [
   "database.sql",
   "roles.sql",
   "schema.sql",
   "jwt.sql",
   "jsonschema.sql",
   "privileges.sql",
   "data.sql",
];

export async function loadFixtures(opts: {
   pgUrl: string;
   fixturesDir?: string;
   user?: string;
   database?: string;
   unavailableExtensions?: Set<string>;
}) {
   const {
      pgUrl,
      fixturesDir = new URL("./sql/", import.meta.url).pathname,
      user = "postgres",
      database = "postgres",
      unavailableExtensions,
   } = opts;

   const dir = fixturesDir.endsWith("/") ? fixturesDir : fixturesDir + "/";

   for (const file of SQL_FILES) {
      console.log(`Loading ${file}...`);
      const path = `${dir}${file}`;

      if (unavailableExtensions?.size) {
         const raw = await Bun.file(path).text();
         const filtered = filterSQL(raw, unavailableExtensions);
         const tmp = join(tmpdir(), `postgrest-fixture-${file}`);
         await Bun.write(tmp, filtered);
         await $`psql ${pgUrl} -f ${tmp} -v ON_ERROR_STOP=1 -v PGUSER=${user} -v DBNAME=${database}`.quiet();
      } else {
         await $`psql ${pgUrl} -f ${path} -v ON_ERROR_STOP=1 -v PGUSER=${user} -v DBNAME=${database}`.quiet();
      }
   }
}
