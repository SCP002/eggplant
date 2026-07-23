import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      LIVEKIT_API_KEY: "test-key",
      LIVEKIT_API_SECRET: "test-secret",
      LIVEKIT_URL: "ws://localhost:7880",
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@eggplant/shared/api": new URL(
        "../shared/src/api/index.ts",
        import.meta.url,
      ).pathname,
      "@eggplant/shared/ws": new URL(
        "../shared/src/ws/index.ts",
        import.meta.url,
      ).pathname,
      "@eggplant/shared": new URL("../shared/src/index.ts", import.meta.url)
        .pathname,
    },
  },
})
