import { definePostgrestTests } from "../index.ts";
import { setupFixtures } from "./setup.ts";

definePostgrestTests({
  target: "http://localhost:3000",
  setup: () => setupFixtures(),
});
