import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // *.test.ts run everywhere; *.itest.ts self-skip unless DATABASE_URL is set.
    include: ["tests/**/*.{test,itest}.ts"],
    environment: "node",
    hookTimeout: 30_000,
  },
});
