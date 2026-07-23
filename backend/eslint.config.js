import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import { globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

// Resolve TS config relative to THIS package so the editor and CLI agree on a
// single root instead of failing to pick between /workspace/frontend and
// /workspace/backend when multiple candidate tsconfigRootDirs exist.
const backendDir = fileURLToPath(new URL(".", import.meta.url))

export default tseslint.config([
  globalIgnores(["dist", "drizzle", "node_modules"]),
  {
    files: ["**/*.{ts,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        tsconfigRootDir: backendDir,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
])
