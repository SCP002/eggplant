import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"

const isTesting = process.env.TESTING === "true"
const backendHost = isTesting ? "localhost" : "backend"

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: "node_modules/emojibase-data/en",
            dest: "emojibase-data/en",
          },
        ],
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: ["frontend"],
      watch: {
        usePolling: true,
      },
      proxy: {
        "/api": {
          target: `http://${backendHost}:8000`,
          changeOrigin: true,
        },
        "/auth": {
          target: `http://${backendHost}:8000`,
          changeOrigin: true,
        },
        "/uploads": {
          target: `http://${backendHost}:8000`,
          changeOrigin: true,
        },
        "/ws": {
          target: `http://${backendHost}:8000`,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: true,
        },
      },
    },
  }
})
