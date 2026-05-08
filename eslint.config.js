import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"src-tauri/target/**",
			"target/**",
			"test-harness/**/bin/**",
			"test-harness/**/obj/**",
			"test-harness/**/Dependencies/**",
			"e2e-tests/dist/**",
			"playwright-report/**",
			"test-results/**",
			"docker/.tmp/**",
		],
	},

	js.configs.recommended,
	...tseslint.configs.recommended,

	{
		files: ["src/**/*.{ts,tsx}", "e2e-tests/**/*.ts", "e2e-ui/**/*.ts"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		settings: {
			react: { version: "detect" },
		},
		plugins: {
			react,
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
		},
		rules: {
			...react.configs.recommended.rules,
			...reactHooks.configs.recommended.rules,
			"react/react-in-jsx-scope": "off",
			"react/prop-types": "off",
			"react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "warn",
			"no-empty": ["error", { allowEmptyCatch: true }],
		},
	},

	{
		files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node, ...globals.jest },
		},
	},

	{
		files: ["*.config.{js,ts}", "*.config.*.{js,ts}"],
		languageOptions: {
			globals: { ...globals.node },
		},
	},

	// must be last so it disables formatting-related rules
	prettier,
);
