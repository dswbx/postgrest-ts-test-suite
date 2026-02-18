// Resolves hspec-wai helpers (methods, headers, matchers) to concrete values

export type Header = [string, string];

export interface HeaderMatcher {
  type: "exact" | "absent" | "contain";
  name: string;
  value?: string;
}

const METHOD_MAP: Record<string, string> = {
  get: "GET",
  post: "POST",
  patch: "PATCH",
  put: "PUT",
  delete: "DELETE",
  methodGet: "GET",
  methodPost: "POST",
  methodPatch: "PATCH",
  methodPut: "PUT",
  methodDelete: "DELETE",
  methodHead: "HEAD",
  methodOptions: "OPTIONS",
};

export function resolveMethod(hs: string): string {
  return METHOD_MAP[hs] ?? hs.toUpperCase();
}

export function resolveHeaderExpr(
  expr: string,
  letBindings: Map<string, string>
): Header[] | null {
  const e = expr.trim();

  // Tuple literal: ("Name", "Value")
  const tupleMatch = e.match(/^\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)$/);
  if (tupleMatch) return [[tupleMatch[1], tupleMatch[2]]];

  // acceptHdrs "mime"
  const acceptMatch = e.match(/^acceptHdrs\s+"([^"]+)"$/);
  if (acceptMatch) return [["Accept", acceptMatch[1]]];

  // authHeaderJWT "token"
  const authMatch = e.match(/^authHeaderJWT\s+"([^"]+)"$/);
  if (authMatch) return [["Authorization", `Bearer ${authMatch[1]}`]];

  // planHdr
  if (e === "planHdr") return [["Accept", "application/vnd.pgrst.plan+json"]];

  // rangeHdrs $ ByteRangeFromTo N M  or  rangeHdrs (ByteRangeFromTo N M)
  const rangeFromTo = e.match(
    /^rangeHdrs\s+[\($]\s*ByteRangeFromTo\s+(\d+)\s+(\d+)\s*\)?$/
  );
  if (rangeFromTo)
    return [
      ["Range-Unit", "items"],
      ["Range", `${rangeFromTo[1]}-${rangeFromTo[2]}`],
    ];

  // rangeHdrs $ ByteRangeFrom N
  const rangeFrom = e.match(
    /^rangeHdrs\s+[\($]\s*ByteRangeFrom\s+(\d+)\s*\)?$/
  );
  if (rangeFrom)
    return [
      ["Range-Unit", "items"],
      ["Range", `${rangeFrom[1]}-`],
    ];

  // rangeHdrsWithCount $ ByteRangeFromTo N M
  const rangeCountFromTo = e.match(
    /^rangeHdrsWithCount\s+[\($]\s*ByteRangeFromTo\s+(\d+)\s+(\d+)\s*\)?$/
  );
  if (rangeCountFromTo)
    return [
      ["Prefer", "count=exact"],
      ["Range-Unit", "items"],
      ["Range", `${rangeCountFromTo[1]}-${rangeCountFromTo[2]}`],
    ];

  // Let binding reference
  if (/^\w+$/.test(e) && letBindings.has(e)) {
    return resolveHeaderExpr(letBindings.get(e)!, letBindings);
  }

  return null;
}

export function parseHeaderList(
  raw: string,
  letBindings: Map<string, string>
): Header[] | null {
  const s = raw.trim();

  // Empty list
  if (s === "[]") return [];

  // Function call (not a list literal): rangeHdrs ..., acceptHdrs ...
  if (!s.startsWith("[")) {
    const resolved = resolveHeaderExpr(s, letBindings);
    return resolved;
  }

  // List literal: [elem1, elem2, ...]
  // Remove outer brackets
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];

  // Split elements (respecting parentheses)
  const elements = splitTopLevel(inner, ",");
  const headers: Header[] = [];

  for (const elem of elements) {
    const resolved = resolveHeaderExpr(elem.trim(), letBindings);
    if (!resolved) return null;
    headers.push(...resolved);
  }

  return headers;
}

// Split string at delimiter, respecting nested parens/brackets
function splitTopLevel(s: string, delim: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inStr = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inStr = !inStr;
      current += ch;
    } else if (inStr) {
      current += ch;
    } else if (ch === "(" || ch === "[") {
      depth++;
      current += ch;
    } else if (ch === ")" || ch === "]") {
      depth--;
      current += ch;
    } else if (ch === delim[0] && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

export function resolveMatcherExpr(expr: string): HeaderMatcher | null {
  const e = expr.trim();

  // "Name" <:> "Value"
  const exactMatch = e.match(/"([^"]+)"\s*<:>\s*"([^"]+)"/);
  if (exactMatch) return { type: "exact", name: exactMatch[1], value: exactMatch[2] };

  // matchHeaderAbsent hContentType
  if (/matchHeaderAbsent\s+hContentType/.test(e))
    return { type: "absent", name: "Content-Type" };

  // matchHeaderAbsent "Name"
  const absentMatch = e.match(/matchHeaderAbsent\s+"([^"]+)"/);
  if (absentMatch) return { type: "absent", name: absentMatch[1] };

  // Named matchers
  if (e.includes("matchContentTypeJson"))
    return { type: "exact", name: "Content-Type", value: "application/json; charset=utf-8" };
  if (e.includes("matchContentTypeSingular"))
    return {
      type: "exact",
      name: "Content-Type",
      value: "application/vnd.pgrst.object+json; charset=utf-8",
    };
  if (e.includes("matchCTArrayStrip"))
    return {
      type: "exact",
      name: "Content-Type",
      value: "application/vnd.pgrst.array+json;nulls=stripped; charset=utf-8",
    };
  if (e.includes("matchCTSingularStrip"))
    return {
      type: "exact",
      name: "Content-Type",
      value: "application/vnd.pgrst.object+json;nulls=stripped; charset=utf-8",
    };

  return null;
}

// Parse the matchHeaders list from a match block
export function parseMatchHeaders(raw: string): {
  headers: [string, string][];
  headersAbsent: string[];
  headersContain: [string, string][];
} | null {
  const headers: [string, string][] = [];
  const headersAbsent: string[] = [];
  const headersContain: [string, string][] = [];

  const inner = raw.trim();
  if (inner === "[]" || !inner) return { headers, headersAbsent, headersContain };

  // Remove outer brackets if present
  const content = inner.startsWith("[") ? inner.slice(1, -1) : inner;
  const elements = splitTopLevel(content, ",");

  for (const elem of elements) {
    const matcher = resolveMatcherExpr(elem);
    if (!matcher) return null;

    switch (matcher.type) {
      case "exact":
        headers.push([matcher.name, matcher.value!]);
        break;
      case "absent":
        headersAbsent.push(matcher.name);
        break;
      case "contain":
        headersContain.push([matcher.name, matcher.value!]);
        break;
    }
  }

  return { headers, headersAbsent, headersContain };
}

// Parse config mapping from Main.hs
export function parseConfigMap(mainHs: string): Map<string, string> {
  const configMap = new Map<string, string>();

  // Find the specs list (specs run with default config via `before withApp`)
  const specsBlock = mainHs.match(
    /specs\s*=\s*uncurry\s+describe\s*<\$>\s*\[([\s\S]*?)\]/
  );
  if (specsBlock) {
    const entries = specsBlock[1].matchAll(
      /\("([^"]+)"\s*,\s*\S+\)/g
    );
    for (const m of entries) {
      const name = m[1].split(".").pop()!.replace(/Spec$/, "");
      configMap.set(m[1], "default");
    }
  }

  // Individual spec configs
  const patterns: [RegExp, string][] = [
    [/before\s+maxRowsApp[\s\S]*?describe\s+"([^"]+)"/, "max-rows"],
    [/before\s+planEnabledApp[\s\S]*?describe\s+"([^"]+)"/, "plan-enabled"],
    [/before\s+aggregatesEnabled[\s\S]*?describe\s+"([^"]+)"/, "aggregates-enabled"],
    [/before\s+noAnonApp[\s\S]*?describe\s+"([^"]+)"/, "no-anon"],
    [/before\s+pgSafeUpdateApp[\s\S]*?describe\s+"([^"]+)"/, "pg-safe-update"],
    [/before\s+serverTiming[\s\S]*?describe\s+"([^"]+)"/, "server-timing"],
    [/before\s+unicodeApp[\s\S]*?describe\s+"([^"]+)"/, "unicode"],
    [/before\s+multipleSchemaApp[\s\S]*?describe\s+"([^"]+)"/, "multiple-schema"],
    [/before\s+obsApp[\s\S]*?describe\s+"([^"]+)"/, "observability"],
  ];

  for (const [re, cfg] of patterns) {
    const m = mainHs.match(re);
    if (m) configMap.set(m[1], cfg);
  }

  return configMap;
}

// Parse relaxed JSON (unquoted keys) → valid JSON
export function parseRelaxedJson(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try strict JSON first
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Add quotes around unquoted keys
  // Match: word chars after { or , (with optional whitespace) followed by :
  const fixed = trimmed.replace(
    /(?<=[\{,]\s*)([a-zA-Z_]\w*)(?=\s*:)/g,
    '"$1"'
  );

  try {
    return JSON.parse(fixed);
  } catch {}

  // Also try replacing single quotes (shouldn't happen but just in case)
  try {
    return JSON.parse(fixed.replace(/'/g, '"'));
  } catch {}

  return undefined; // parse failure
}
