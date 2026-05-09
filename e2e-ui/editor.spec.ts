/**
 * Frontend-only E2E tests for the editor (no real WebSocket).
 *
 * Drives the running Vite dev server with a stubbed Tauri runtime, verifying
 * that the JSON open / tree edit / undo / redo / export flows actually update
 * the UI. These would have caught the v0.1.0 bug where loadDocument silently
 * threw inside the FileReader.onload handler and the work group never appeared.
 */
import { test, expect } from "@playwright/test";
import { installTauriStub } from "./fixtures.js";

const SAMPLE_DOC = [
	{
		Id: "wg-1",
		Name: "サンプル仕業群",
		DBVersion: 1,
		Works: [
			{
				Id: "w-1",
				Name: "仕業A",
				AffectDate: "2026-05-08",
				AffixContentType: null,
				AffixContent: null,
				Remarks: null,
				HasETrainTimetable: null,
				ETrainTimetableContentType: null,
				ETrainTimetableContent: null,
				Trains: [
					{
						Id: "t-1",
						TrainNumber: "1001M",
						MaxSpeed: null,
						SpeedType: null,
						NominalTractiveCapacity: null,
						CarCount: null,
						Destination: "東京",
						BeginRemarks: null,
						AfterRemarks: null,
						Remarks: null,
						BeforeDeparture: null,
						TrainInfo: null,
						Direction: 1,
						WorkType: null,
						AfterArrive: null,
						BeforeDeparture_OnStationTrackCol: null,
						AfterArrive_OnStationTrackCol: null,
						DayCount: null,
						IsRideOnMoving: null,
						Color: null,
						TimetableRows: [
							{
								Id: "r-1",
								StationName: "新宿",
								Location_m: 0,
								Longitude_deg: null,
								Latitude_deg: null,
								OnStationDetectRadius_m: null,
								FullName: null,
								RecordType: null,
								TrackName: null,
								DriveTime_MM: null,
								DriveTime_SS: null,
								IsOperationOnlyStop: null,
								IsPass: null,
								HasBracket: null,
								IsLastStop: null,
								Arrive: null,
								Departure: "10:00",
								RunInLimit: null,
								RunOutLimit: null,
								Remarks: null,
								MarkerColor: null,
								MarkerText: null,
								WorkType: null,
							},
						],
						NextTrainId: null,
					},
				],
			},
		],
	},
];

test.beforeEach(async ({ page }) => {
	await installTauriStub(page);
});

test("JSONを開く populates the work-group tree", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText("ツリーから項目を選択してください")).toBeVisible();

	await page.setInputFiles('input[type="file"]', {
		name: "sample.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(SAMPLE_DOC)),
	});

	// Tree shows the work group from the loaded JSON
	await expect(page.getByText("サンプル仕業群")).toBeVisible();
});

test("JSONを開く + drill into train shows timetable", async ({ page }) => {
	await page.goto("/");

	await page.setInputFiles('input[type="file"]', {
		name: "sample.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(SAMPLE_DOC)),
	});

	// ツリーは既定で全展開されるため、仕業群配下の仕業・列車は読み込み直後に見える。
	await expect(page.getByText("仕業A")).toBeVisible();
	await expect(page.getByText("1001M → 東京")).toBeVisible();

	await page.getByText("1001M → 東京").click();

	// TimetableTable header and the row's station-name input show up
	await expect(page.getByText(/1001M → 東京 \(1行\)/)).toBeVisible();
	await expect(page.locator('input[value="新宿"]')).toBeVisible();
});

test("仕業群追加 adds a row to the tree", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "+ 仕業群追加" }).click();
	await expect(page.getByText("新規仕業群")).toBeVisible();
});

test("undo / redo round-trip after add", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "+ 仕業群追加" }).click();
	await expect(page.getByText("新規仕業群")).toBeVisible();

	await page.getByRole("button", { name: /↩ 元に戻す/ }).click();
	await expect(page.getByText("新規仕業群")).toHaveCount(0);

	await page.getByRole("button", { name: /↪ やり直す/ }).click();
	await expect(page.getByText("新規仕業群")).toBeVisible();
});

test("不正な JSON を開くとアラートで知らせる", async ({ page }) => {
	await page.goto("/");
	page.on("dialog", (d) => {
		expect(d.message()).toContain("JSONの読み込みに失敗");
		d.accept();
	});
	await page.setInputFiles('input[type="file"]', {
		name: "broken.json",
		mimeType: "application/json",
		buffer: Buffer.from("{not valid json"),
	});
	// Tree must remain empty
	await expect(page.getByText("ツリーから項目を選択してください")).toBeVisible();
});
