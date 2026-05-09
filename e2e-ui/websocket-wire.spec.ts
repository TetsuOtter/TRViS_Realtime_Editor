/**
 * Real-WebSocket E2E for the editor → TRViS broadcast path.
 *
 * Spawns the standalone `trvis-ws-server` binary (built from
 * crates/trvis-ws-server-bin) so the Playwright stub can forward the
 * `broadcast_timetable` invoke through HTTP /cmd into the actual Rust WS
 * server. A Node WebSocket client subscribes as TRViS would and asserts on
 * the wire-level frame.
 *
 * The binary is the same one used by the Vitest E2E suite under docker —
 * here we run it locally to keep the test self-contained.
 */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { installTauriStub } from "./fixtures.js";

const WS_PORT = 23529;
const CMD_PORT = 23530;
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = resolve(__dirname, "../target/debug/trvis-ws-server");

let server: ChildProcess | null = null;

test.beforeAll(async () => {
	if (!existsSync(BIN_PATH)) {
		throw new Error(
			`trvis-ws-server binary not found at ${BIN_PATH}. Run \`cargo build -p trvis-ws-server-bin\` first.`,
		);
	}
	server = spawn(
		BIN_PATH,
		[
			"--host",
			"127.0.0.1",
			"--port",
			String(WS_PORT),
			"--cmd-port",
			String(CMD_PORT),
			"--sync-interval-ms",
			"0",
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	await new Promise<void>((resolveReady, rejectReady) => {
		const t = setTimeout(() => rejectReady(new Error("ws-server-bin readiness timeout")), 10_000);
		server!.stdout!.on("data", (chunk: Buffer) => {
			if (chunk.toString().includes("ready port=")) {
				clearTimeout(t);
				resolveReady();
			}
		});
		server!.on("exit", (code) => rejectReady(new Error(`bin exited early code=${code}`)));
	});
	// Give axum cmd-port a beat to start its listener after stdout signal.
	await delay(150);
});

test.afterAll(async () => {
	if (server && !server.killed) {
		server.kill("SIGTERM");
		await delay(200);
		if (!server.killed) server.kill("SIGKILL");
	}
});

const FIXTURE = [
	{
		Id: "wire-wg-1",
		Name: "wire-test-group",
		DBVersion: 7,
		Works: [
			{
				Id: "wire-w-1",
				Name: "wire-test-work",
				AffectDate: null,
				AffixContentType: null,
				AffixContent: null,
				Remarks: null,
				HasETrainTimetable: null,
				ETrainTimetableContentType: null,
				ETrainTimetableContent: null,
				Trains: [],
			},
		],
	},
];

test("「全データ配信」が WebSocket クライアントに正しい Timetable フレームを届ける", async ({
	page,
}) => {
	// 1) Subscribe a Node WebSocket client like TRViS would.
	const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}/ws`);
	const frames: string[] = [];
	const timetable = new Promise<Record<string, unknown>>((resolveFrame, rejectFrame) => {
		const t = setTimeout(() => rejectFrame(new Error("no Timetable frame received")), 10_000);
		ws.addEventListener("message", (ev: MessageEvent) => {
			const text = typeof ev.data === "string" ? ev.data : "";
			frames.push(text);
			try {
				const msg = JSON.parse(text) as Record<string, unknown>;
				if (msg.MessageType === "Timetable") {
					clearTimeout(t);
					resolveFrame(msg);
				}
			} catch {
				/* not JSON */
			}
		});
		ws.addEventListener("error", (e: Event) => rejectFrame(new Error(`ws error: ${String(e)}`)));
	});

	await new Promise<void>((r) => ws.addEventListener("open", () => r()));

	// 2) Drive the UI with the Tauri stub forwarding to the bin's /cmd endpoint.
	await installTauriStub(page, { cmdPortUrl: `http://127.0.0.1:${CMD_PORT}` });
	await page.goto("/");

	await page.setInputFiles('input[type="file"]', {
		name: "wire.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(FIXTURE)),
	});
	await expect(page.getByText("wire-test-group")).toBeVisible();

	await page.getByRole("button", { name: "全データ配信" }).click();

	// 3) Verify the frame TRViS would actually see.
	const frame = await timetable;
	expect(frame.MessageType).toBe("Timetable");
	expect(frame.WorkGroupId ?? null).toBeNull();
	expect(frame.WorkId ?? null).toBeNull();
	expect(frame.TrainId ?? null).toBeNull();
	const data = frame.Data as Array<{ Id: string; Name: string; DBVersion: number }>;
	expect(Array.isArray(data)).toBe(true);
	expect(data).toHaveLength(1);
	expect(data[0].Id).toBe("wire-wg-1");
	expect(data[0].Name).toBe("wire-test-group");
	expect(data[0].DBVersion).toBe(7);

	ws.close();
});
