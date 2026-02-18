// Fetch API request builder — takes target + test case request, returns Response

import type { TestSuiteOptions, TestCase } from "./config.ts";

export async function executeRequest(
  target: TestSuiteOptions["target"],
  req: TestCase["request"]
): Promise<Response> {
  // Some upstream specs include raw "#" in query params, but URL fragments
  // are not sent over HTTP. Preserve intent by encoding it.
  const normalizedPath = req.path.replace(/#/g, "%23");
  const path = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  const headers = new Headers();
  for (const [name, value] of req.headers) {
    headers.append(name, value);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  // Only set body for methods that support it
  if (req.body !== null && !["GET", "HEAD"].includes(req.method)) {
    init.body = req.body;
    // Set content-type if not already set and body looks like JSON
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  if (typeof target === "string") {
    return fetch(new Request(target + path, init));
  }

  // Handler function — call directly
  return target(new Request(`http://localhost${path}`, init));
}
