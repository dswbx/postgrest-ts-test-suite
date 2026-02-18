// Fetch API request builder — takes target + test case request, returns Response

import type { TestSuiteOptions, TestCase } from "./config.ts";

export async function executeRequest(
  target: TestSuiteOptions["target"],
  req: TestCase["request"]
): Promise<Response> {
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
    return fetch(new Request(target + req.path, init));
  }

  // Handler function — call directly
  return target(new Request(`http://localhost${req.path}`, init));
}
