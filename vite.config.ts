import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

const zustandVanillaAlias = path.resolve(
	import.meta.dirname,
	"./src/test/zustand-vanilla-patched.ts",
);

export default defineConfig({
	plugins: [react()],
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
		watch: { ignored: ["**/src-tauri/**", "**/test-harness/**", "**/docker/**"] },
	},
	build: {
		target: "es2022",
		minify: "esbuild",
		sourcemap: true,
	},
	// @ts-expect-error vitest extends vite's UserConfig with `test`
	test: {
		environment: "happy-dom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
		alias: [
			{
				find: "zustand/vanilla",
				replacement: zustandVanillaAlias,
			},
		],
	},
});
