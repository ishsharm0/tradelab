import js from "@eslint/js";
import globals from "globals";

const codeFiles = [
  "src/**/*.js",
  "test/**/*.js",
  "scripts/**/*.mjs",
  "bin/**/*.js",
  "examples/**/*.js",
];

export default [
  {
    ignores: ["dist/**", "node_modules/**", "output/**", "*.tgz"],
  },
  {
    ...js.configs.recommended,
    files: codeFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
