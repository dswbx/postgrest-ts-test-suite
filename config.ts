// TestSuiteOptions type, defaults, validation

export interface TestSuiteOptions {
  // URL string → real HTTP requests via fetch()
  // Handler fn → calls directly (e.g. Bun.serve's fetch handler)
  target: string | ((req: Request) => Response | Promise<Response>);

  // Called once before all tests. Use for DB setup, migrations, seeding, etc.
  setup?: () => Promise<void> | void;

  // skip test files by name, e.g. ["postgis", "unicode"]
  skip?: string[];

  // only run these, e.g. ["query", "insert"]
  only?: string[];

  // skip individual tests by description substring
  skipTests?: string[];

  // skip configs, e.g. ["max-rows", "plan-enabled"]
  skipConfigs?: string[];
}

export interface TestSpec {
  file: string;
  config: string;
  tests: TestCase[];
}

export interface TestCase {
  description: string[];
  request: {
    method: string;
    path: string;
    headers: [string, string][];
    body: string | null;
  };
  expected: {
    status: number;
    body: unknown;
    bodyExact: boolean;
    headers: [string, string][];
    headersAbsent: string[];
    headersContain: [string, string][];
  };
}
