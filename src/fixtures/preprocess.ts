// Strips SQL blocks guarded by @skip-if-missing markers for unavailable extensions

const SKIP_RE = /^-- @skip-if-missing:\s*(\S+)\s*$/;
const END_RE = /^-- @end-skip\s*$/;

export function filterSQL(sql: string, unavailable: Set<string>): string {
  if (unavailable.size === 0) return sql;

  const lines = sql.split("\n");
  const out: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (skipping) {
      if (END_RE.test(line)) skipping = false;
      continue;
    }

    const m = line.match(SKIP_RE);
    if (m && unavailable.has(m[1])) {
      skipping = true;
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}
