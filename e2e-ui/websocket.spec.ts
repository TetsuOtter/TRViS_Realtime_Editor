/**
 * Verifies the editor's WebSocket-broadcast contract toward TRViS.
 *
 * Approach: stub `__TAURI_INTERNALS__.invoke` to record every call, then drive
 * the UI. We assert that "全データ配信" / SyncedData edits invoke the right
 * Tauri commands with the right argument shapes. Those argument shapes feed
 * directly into the Rust `broadcast_timetable` / `set_synced_data` handlers,
 * which are themselves end-to-end tested against the .NET TRViS harness via
 * `pnpm test:e2e`. Together, the two suites cover the whole edit→TRViS path.
 */
import { test, expect } from "@playwright/test";
import { installTauriStub, getInvokes, clearInvokes } from "./fixtures.js";

const SIMPLE_DOC = [
	{
		Id: "wg-broadcast",
		Name: "ブロードキャスト用",
		DBVersion: 1,
		Works: [],
	},
];

test.beforeEach(async ({ page }) => {
	await installTauriStub(page);
});

test("「全データ配信」が broadcast_timetable を Scope.All で発火する", async ({ page }) => {
	await page.goto("/");

	await page.setInputFiles('input[type="file"]', {
		name: "doc.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(SIMPLE_DOC)),
	});
	await expect(page.getByText("ブロードキャスト用")).toBeVisible();

	await clearInvokes(page);
	await page.getByRole("button", { name: "全データ配信" }).click();

	await expect
		.poll(async () => {
			const invokes = await getInvokes(page);
			return invokes.find((i) => i.cmd === "broadcast_timetable");
		})
		.toBeTruthy();

	const invokes = await getInvokes(page);
	const broadcast = invokes.find((i) => i.cmd === "broadcast_timetable")!;

	// All-scope: every id is null, data is the full WorkGroupData[].
	expect(broadcast.args).toMatchObject({
		workGroupId: null,
		workId: null,
		trainId: null,
	});
	const data = (broadcast.args as { data: unknown }).data as Array<{ Id: string }>;
	expect(Array.isArray(data)).toBe(true);
	expect(data).toHaveLength(1);
	expect(data[0].Id).toBe("wg-broadcast");
});

test("Tauri 環境で起動時に WebSocket イベントを購読する", async ({ page }) => {
	await page.goto("/");

	// On mount, App.tsx and ConnectionPanel.tsx each subscribe to "ws-event".
	// That goes through Tauri's listen() → invoke('plugin:event|listen', ...).
	// The subscribe runs through async dynamic imports so poll until at least one fires.
	await expect
		.poll(
			async () => {
				const invokes = await getInvokes(page);
				return invokes.filter(
					(i) =>
						i.cmd === "plugin:event|listen" && (i.args as { event?: string })?.event === "ws-event",
				).length;
			},
			{ timeout: 5_000 },
		)
		.toBeGreaterThanOrEqual(1);
});
