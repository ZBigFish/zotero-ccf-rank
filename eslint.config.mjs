// @ts-check Let TS check this config file

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "build-test/**",
      "dist/**",
      "node_modules/**",
      "scripts/",
      // Generated CCF catalog data (hundreds of entries).
      "src/data/ccfCatalog.ts",
      // Classic script evaluated inside the preferences window.
      "src/ui/prefs-pane.js",
      "addon/prefs-pane.js",
      "tools/out/**",
    ],
  },
  {
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": "allow-with-description",
          "ts-check": "allow-with-description",
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": [
        "off",
        {
          ignoreRestArgs: true,
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Maintenance scripts run in plain Node with CommonJS.
    files: ["tools/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
