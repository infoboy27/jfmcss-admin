import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // *.test.ts run everywhere; *.itest.ts self-skip unless DATABASE_URL is set.
    include: ["tests/**/*.{test,itest}.ts"],
    environment: "node",
    hookTimeout: 30_000,
    // The *.itest.ts suites share one Postgres database and TRUNCATE it between
    // tests — parallel files would deadlock each other. Run files serially; the
    // pure-unit suites are fast enough that this costs nothing.
    fileParallelism: false,
  },
});
