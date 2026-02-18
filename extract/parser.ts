// Haskell spec → JSON parser
// Line-oriented state machine that extracts test cases from PostgREST hspec-wai specs

import {
  type Header,
  resolveMethod,
  parseHeaderList,
  parseMatchHeaders,
  parseRelaxedJson,
  resolveHeaderExpr,
} from "./helpers.ts";

export interface TestCase {
  description: string[];
  request: {
    method: string;
    path: string;
    headers: Header[];
    body: string | null;
  };
  expected: {
    status: number;
    body: unknown;
    bodyExact: boolean;
    headers: Header[];
    headersAbsent: string[];
    headersContain: [string, string][];
  };
}

export interface FlaggedTest {
  description: string[];
  reason: string;
  line: number;
  source: string;
}

export interface ParseResult {
  file: string;
  config: string;
  tests: TestCase[];
  flagged: FlaggedTest[];
}

// Complex test detection patterns
const COMPLEX_PATTERNS: [RegExp, string][] = [
  [/\bliftIO\b/, "liftIO — side-effect"],
  [/\bpendingWith\b/, "pendingWith — skipped upstream"],
  [/\\\s*_\s*->/, "lambda pattern"],
  [/\banalyzeTable\b/, "analyzeTable — psql shell-out"],
  [/\bsimpleBody\b/, "simpleBody — custom assertion"],
  [/\bsimpleHeaders\b/, "simpleHeaders — custom assertion"],
  [/\bsimpleStatus\b/, "simpleStatus — custom assertion"],
  [/\bshouldSatisfy\b/, "shouldSatisfy — custom predicate"],
  [/\bshouldBe\b/, "shouldBe — custom assertion"],
];

export function parseSpecFile(
  filename: string,
  source: string,
  config: string
): ParseResult {
  const lines = source.split("\n");
  const describeStack: { indent: number; text: string }[] = [];
  const letBindings = new Map<string, string>();
  const tests: TestCase[] = [];
  const flagged: FlaggedTest[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const indent = line.search(/\S/);
    if (indent === -1) {
      i++;
      continue;
    }

    const stripped = line.trimStart();

    // Skip module/import/type sig lines
    if (
      /^(module |import |spec\s*::|{-#)/.test(stripped) ||
      stripped.startsWith("--")
    ) {
      i++;
      continue;
    }

    // Let binding: let name = expr
    const letMatch = stripped.match(/^let\s+(\w+)\s*=\s*(.+)/);
    if (letMatch) {
      letBindings.set(letMatch[1], letMatch[2].trim());
      i++;
      continue;
    }

    // describe/context block
    const descMatch = stripped.match(/^(?:describe|context)\s+"((?:[^"\\]|\\.)*)"/);
    if (descMatch) {
      while (
        describeStack.length > 0 &&
        describeStack[describeStack.length - 1]!.indent >= indent
      ) {
        describeStack.pop();
      }
      describeStack.push({ indent, text: descMatch[1] });
      i++;
      continue;
    }

    // it block
    const itMatch = stripped.match(/^it\s+"((?:[^"\\]|\\.)*)"/);
    if (itMatch) {
      // Pop describe entries at >= it indent (sibling contexts, not parents)
      while (
        describeStack.length > 0 &&
        describeStack[describeStack.length - 1]!.indent >= indent
      ) {
        describeStack.pop();
      }

      const itDesc = itMatch[1];
      const itIndent = indent;
      const itLine = i + 1; // 1-based

      // Collect all lines of this it block
      const blockLines: string[] = [line];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextIndent = nextLine.search(/\S/);
        if (nextIndent === -1) {
          // blank line — include but check if next real line is still in block
          blockLines.push(nextLine);
          i++;
          continue;
        }
        if (nextIndent <= itIndent) break;
        blockLines.push(nextLine);
        i++;
      }

      const blockText = blockLines.join("\n");
      const fullDesc = [...describeStack.map((d) => d.text), itDesc];

      processItBlock(fullDesc, blockText, itLine, letBindings, tests, flagged);
      continue;
    }

    // spec = do (top level)
    if (/^spec\s*=/.test(stripped)) {
      i++;
      continue;
    }

    i++;
  }

  return {
    file: filename.replace(/Spec\.hs$/, "").replace(/\.hs$/, ""),
    config,
    tests,
    flagged,
  };
}

function processItBlock(
  description: string[],
  blockText: string,
  line: number,
  letBindings: Map<string, string>,
  tests: TestCase[],
  flagged: FlaggedTest[]
) {
  // Remove Haskell comments (but not -- inside string literals)
  const cleaned = removeHaskellComments(blockText);

  // Check for complex patterns
  for (const [pat, reason] of COMPLEX_PATTERNS) {
    if (pat.test(cleaned)) {
      flagged.push({ description, reason, line, source: blockText.trim() });
      return;
    }
  }

  // Count shouldRespondWith occurrences
  const srwMatches = [...cleaned.matchAll(/`shouldRespondWith`/g)];

  if (srwMatches.length === 0) {
    flagged.push({
      description,
      reason: "no shouldRespondWith found",
      line,
      source: blockText.trim(),
    });
    return;
  }

  if (srwMatches.length === 1) {
    // Single test case
    const tc = parseSingleTest(cleaned, letBindings);
    if (tc) {
      tc.description = description;
      tests.push(tc);
    } else {
      flagged.push({
        description,
        reason: "parse failure",
        line,
        source: blockText.trim(),
      });
    }
    return;
  }

  // Multiple shouldRespondWith — try to split
  const subBlocks = splitMultiSRW(cleaned);

  // Check if all sub-blocks use read-only methods (safe to split)
  let canSplit = true;
  for (const sub of subBlocks) {
    if (/\b(post|patch|request\s+method(Delete|Put|Post|Patch))\b/.test(sub)) {
      canSplit = false;
      break;
    }
  }

  if (!canSplit) {
    flagged.push({
      description,
      reason: "multiple shouldRespondWith with mutations",
      line,
      source: blockText.trim(),
    });
    return;
  }

  // Split into separate tests
  for (let idx = 0; idx < subBlocks.length; idx++) {
    const tc = parseSingleTest(subBlocks[idx], letBindings);
    if (tc) {
      tc.description = [
        ...description.slice(0, -1),
        `${description[description.length - 1]} (${idx + 1})`,
      ];
      tests.push(tc);
    } else {
      flagged.push({
        description: [
          ...description.slice(0, -1),
          `${description[description.length - 1]} (${idx + 1})`,
        ],
        reason: "parse failure in split block",
        line,
        source: subBlocks[idx].trim(),
      });
    }
  }
}

// Split a multi-shouldRespondWith block at request boundaries
function splitMultiSRW(text: string): string[] {
  // Find positions of each request start
  const requestStarts: number[] = [];
  const re = /(?:^|\n)\s*(?:get\s+"|post\s+"|patch\s+"|request\s+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    requestStarts.push(m.index);
  }

  if (requestStarts.length <= 1) return [text];

  const blocks: string[] = [];
  for (let i = 0; i < requestStarts.length; i++) {
    const start = requestStarts[i];
    const end = i + 1 < requestStarts.length ? requestStarts[i + 1] : text.length;
    blocks.push(text.slice(start, end));
  }
  return blocks;
}

function parseSingleTest(
  block: string,
  letBindings: Map<string, string>
): TestCase | null {
  // Find shouldRespondWith split point
  const srwIdx = block.indexOf("`shouldRespondWith`");
  if (srwIdx === -1) return null;

  const requestPart = block.slice(0, srwIdx);
  const assertPart = block.slice(srwIdx + "`shouldRespondWith`".length);

  const req = parseRequest(requestPart, letBindings);
  if (!req) return null;

  const expected = parseExpected(assertPart);
  if (!expected) return null;

  return {
    description: [],
    request: req,
    expected,
  };
}

function parseRequest(
  text: string,
  letBindings: Map<string, string>
): TestCase["request"] | null {
  const s = text.replace(/\s+/g, " ").trim();

  // Use escaped-quote-aware path pattern
  const pathPat = `"((?:[^"\\\\]|\\\\.)*)"`;

  // Pattern 1: get "/path"
  const getMatch = s.match(new RegExp(`\\bget\\s+${pathPat}`));
  if (getMatch) {
    return { method: "GET", path: unescapePath(getMatch[1]), headers: [], body: null };
  }

  // Pattern 2: post "/path" body
  const postMatch = s.match(new RegExp(`\\bpost\\s+${pathPat}\\s+([\\s\\S]+)`));
  if (postMatch) {
    const body = extractBody(postMatch[2]);
    return { method: "POST", path: unescapePath(postMatch[1]), headers: [], body };
  }

  // Pattern 3: request methodX "/path" headers body
  const reqMatch = s.match(
    new RegExp(`\\brequest\\s+(\\w+)\\s+${pathPat}\\s+([\\s\\S]+)`)
  );
  if (reqMatch) {
    const method = resolveMethod(reqMatch[1]);
    const path = unescapePath(reqMatch[2]);
    const rest = reqMatch[3];

    // Parse headers and body from rest
    const { headers, body } = parseHeadersAndBody(rest, letBindings);
    return { method, path, headers, body };
  }

  return null;
}

function unescapePath(p: string): string {
  return p.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function parseHeadersAndBody(
  rest: string,
  letBindings: Map<string, string>
): { headers: Header[]; body: string | null } {
  const s = rest.trim();

  // Find the header list (either [...] or a function call) and the body after it
  // Headers can be: [], [("H","V")], [singular], (rangeHdrs ...), etc.
  // Body follows headers: "", mempty, [json|...|], "string"

  let headerStr: string;
  let bodyStr: string;

  if (s.startsWith("[")) {
    // Find matching ]
    const closeIdx = findMatchingBracket(s, 0, "[", "]");
    if (closeIdx === -1) return { headers: [], body: null };
    headerStr = s.slice(0, closeIdx + 1);
    bodyStr = s.slice(closeIdx + 1).trim();
  } else if (s.startsWith("(")) {
    // Find matching ) — strip outer parens for resolveHeaderExpr
    const closeIdx = findMatchingBracket(s, 0, "(", ")");
    if (closeIdx === -1) return { headers: [], body: null };
    // Strip outer parens: (rangeHdrs $ ByteRangeFromTo 0 1) → rangeHdrs $ ByteRangeFromTo 0 1
    headerStr = s.slice(1, closeIdx);
    bodyStr = s.slice(closeIdx + 1).trim();
  } else {
    // Could be a simple name like: singular body
    // Or: rangeHdrs $ ByteRangeFromTo 0 1) mempty
    // Hard to parse generically — try to find body markers
    const bodyMarkers = ['[json|', '""', 'mempty', '"'];
    let splitAt = -1;
    for (const marker of bodyMarkers) {
      const idx = s.indexOf(marker);
      if (idx !== -1) {
        splitAt = idx;
        break;
      }
    }
    if (splitAt === -1) return { headers: [], body: null };
    headerStr = s.slice(0, splitAt).trim();
    bodyStr = s.slice(splitAt).trim();
  }

  const headers = parseHeaderList(headerStr, letBindings) ?? [];
  const body = extractBody(bodyStr);

  return { headers, body };
}

function findMatchingBracket(
  s: string,
  start: number,
  open: string,
  close: string
): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inStr = !inStr;
    } else if (!inStr) {
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

function extractBody(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed || trimmed === '""' || trimmed === "mempty") return null;

  // [json|...|]
  const jsonQQ = extractJsonQuasiquote(trimmed);
  if (jsonQQ !== undefined) {
    const parsed = parseRelaxedJson(jsonQQ);
    if (parsed !== undefined) return JSON.stringify(parsed);
  }

  // Quoted string
  const strMatch = trimmed.match(/^"([^"]*)"$/);
  if (strMatch) {
    if (strMatch[1] === "") return null;
    // Try parsing as JSON
    try {
      return JSON.stringify(JSON.parse(strMatch[1]));
    } catch {
      return strMatch[1];
    }
  }

  return null;
}

function extractJsonQuasiquote(s: string): string | undefined {
  const start = s.indexOf("[json|");
  if (start === -1) return undefined;

  const contentStart = start + "[json|".length;
  const end = s.indexOf("|]", contentStart);
  if (end === -1) return undefined;

  return s.slice(contentStart, end).trim();
}

function parseExpected(text: string): TestCase["expected"] | null {
  const s = text.trim();

  // Status-only: just a number
  const statusOnly = s.match(/^\s*(\d+)\s*$/);
  if (statusOnly) {
    return {
      status: parseInt(statusOnly[1]),
      body: null,
      bodyExact: true,
      headers: [],
      headersAbsent: [],
      headersContain: [],
    };
  }

  // Find the response body and optional match block
  let body: unknown = null;
  let status = 200;
  let headers: Header[] = [];
  let headersAbsent: string[] = [];
  let headersContain: [string, string][] = [];

  // Extract JSON quasiquote body
  const jsonStart = s.indexOf("[json|");
  const jsonEnd = s.indexOf("|]");
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const jsonContent = s.slice(jsonStart + 6, jsonEnd).trim();
    const parsed = parseRelaxedJson(jsonContent);
    if (parsed === undefined) return null;
    body = parsed;
  } else {
    // String body: "..."
    const strMatch = s.match(/^\s*"([^"]*)"/);
    if (strMatch) {
      if (strMatch[1] === "") {
        body = "";
      } else {
        try {
          body = JSON.parse(strMatch[1]);
        } catch {
          body = strMatch[1];
        }
      }
    }
  }

  // Extract match block: { matchStatus = N, matchHeaders = [...] }
  const matchBlock = extractMatchBlock(s);
  if (matchBlock) {
    // matchStatus
    const statusMatch = matchBlock.match(/matchStatus\s*=\s*(\d+)/);
    if (statusMatch) status = parseInt(statusMatch[1]);

    // matchHeaders
    const headersMatch = matchBlock.match(
      /matchHeaders\s*=\s*(\[[\s\S]*?\])/
    );
    if (headersMatch) {
      const parsed = parseMatchHeaders(headersMatch[1]);
      if (parsed) {
        headers = parsed.headers;
        headersAbsent = parsed.headersAbsent;
        headersContain = parsed.headersContain;
      }
    }
  }

  return {
    status,
    body,
    bodyExact: true,
    headers,
    headersAbsent,
    headersContain,
  };
}

function extractMatchBlock(s: string): string | null {
  // Find { matchStatus or { matchHeaders (the match block)
  // Must find the opening { that starts the match block (not a JSON {)
  // The match block comes after |] or after the body string

  // Look for { that contains matchStatus or matchHeaders
  const matchBlockRe = /\{\s*match(?:Status|Headers)/;
  const m = matchBlockRe.exec(s);
  if (!m) return null;

  const start = m.index;
  const end = findMatchingBracket(s, start, "{", "}");
  if (end === -1) return null;

  return s.slice(start + 1, end);
}

// Remove Haskell line comments (-- ...) but not inside string literals or URLs
function removeHaskellComments(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((line) => {
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
          inStr = !inStr;
        } else if (!inStr && ch === "-" && line[i + 1] === "-") {
          // Check it's not inside a quasiquote [json|...|]
          const before = line.slice(0, i);
          if (before.includes("[json|") && !before.includes("|]")) continue;
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}
