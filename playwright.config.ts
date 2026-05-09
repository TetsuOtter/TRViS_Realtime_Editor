import { defineConfig, devices } from "@playwright/test";

// Use a dedicated port so Playwright doesn't fight the user's `pnpm tauri:dev`.
const PORT = 1421;

export default defineConfig({
	testDir: "./e2e-ui",
	timeout: 30_000,
	fullyParallel: false,
	workers: 1,
	reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
		actionTimeout: 5_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `pnpm dev --port ${PORT}`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
