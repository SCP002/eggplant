import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import { globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

// Resolve TS config relative to THIS package so the editor and CLI agree on a
// single root instead of failing to pick between /workspace/frontend and
// /workspace/backend when multiple candidate tsconfigRootDirs exist.
const frontendDir = fileURLToPath(new URL(".", import.meta.url))

export default tseslint.config([
  globalIgnores([
    "dist",
    "**/build/**",
    "android/**",
    "electron/**",
    "playwright-report",
    "test-results",
    "blob-report",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: frontendDir,
      },
    },
    rules: {
      // shadcn/ui + plate.js co-locate variants, hooks and HOC-wrapped
      // components with components in the same file; allow those exports.
      "react-refresh/only-export-components": [
        "error",
        {
          allowExportNames: [
            "useTheme",
            "useComboboxAnchor",
            "CaptionButton",
            "PlaceholderElement",
            "ToolbarButton",
            "BigEmojiPlugin",
            "badgeVariants",
            "buttonVariants",
            "editorVariants",
            "mediaResizeHandleVariants",
          ],
        },
      ],
      // Allow `_`-prefixed args/vars that are intentionally unused (e.g. a
      // callback param required by an interceptor/plugin by position).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
])
