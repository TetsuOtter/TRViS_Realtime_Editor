/**
 * Playwright helpers that fake the Tauri runtime so the React app can run in a
 * normal browser. Every `invoke()` call is recorded on `window.__invokes`, and
 * `subscribeWsEvents` listeners are stored on `window.__wsListeners` so tests
 * can drive incoming events.
 */
import type { Page } from "@playwright/test";

export interface InvokeRecord {
	cmd: string;
	args: Record<string, unknown> | undefined;
}

declare global {
	interface Window {
		__invokes: InvokeRecord[];
		__wsListeners: Array<(payload: unknown) => void>;
		__forwardCmd?: (body: Record<string, unknown>) => Promise<void>;
	}
}

/**
 * Inject a stub `__TAURI_INTERNALS__` before any module loads so that
 * `loadTauri()` in src/api/wsServer.ts succeeds and returns our fakes.
 *
 * The Tauri SDK (>=2) reads `window.__TAURI_INTERNALS__.invoke` and
 * `.transformCallback`/`.metadata` for the event API. We provide minimal
 * implementations that route everything through `window.__invokes` and a
 * single-channel listener registry.
 *
 * If `cmdPortUrl` is set, `broadcast_timetable` and `set_synced_data` invokes
 * are also forwarded to the standalone trvis-ws-server bin's HTTP cmd port,
 * so a real WebSocket client can verify what TRViS would actually receive.
 */
export interface InstallStubOptions {
	/** When set, the page also gets a `__forwardCmd(body)` function that POSTs
	 *  to this URL's `/cmd` endpoint from Node (avoids browser CORS). */
	cmdPortUrl?: string;
}

export async function installTauriStub(page: Page, opts: InstallStubOptions = {}): Promise<void> {
	if (opts.cmdPortUrl) {
		const url = opts.cmdPortUrl;
		await page.exposeFunction("__forwardCmd", async (body: Record<string, unknown>) => {
			await fetch(`${url}/cmd`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		});
	}
	await page.addInitScript(() => {
		window.__invokes = [];
		window.__wsListeners = [];

		const forwardCmd = async (body: Record<string, unknown>) => {
			if (typeof window.__forwardCmd === "function") {
				await window.__forwardCmd(body);
			}
		};

		const internals = {
			invoke: (cmd: string, args?: Record<string, unknown>) => {
				window.__invokes.push({ cmd, args });
				switch (cmd) {
					case "plugin:event|listen":
						return Promise.resolve(1);
					case "plugin:event|unlisten":
						return Promise.resolve();
					case "list_local_hosts":
						return Promise.resolve(["127.0.0.1"]);
					case "start_server":
						return Promise.resolve({ port: 23519, hosts: ["127.0.0.1"] });
					case "stop_server":
						return Promise.resolve();
					case "broadcast_timetable":
						return forwardCmd({
							command: "timetable",
							work_group_id: (args as { workGroupId?: string | null })?.workGroupId ?? null,
							work_id: (args as { workId?: string | null })?.workId ?? null,
							train_id: (args as { trainId?: string | null })?.trainId ?? null,
							data: (args as { data?: unknown })?.data,
						});
					case "set_synced_data":
						return forwardCmd({
							command: "sync",
							location_m: (args as { locationM?: number | null })?.locationM ?? null,
							time_ms: (args as { timeMs?: number })?.timeMs ?? 0,
							can_start: (args as { canStart?: boolean })?.canStart ?? true,
							auto_time_ms: (args as { autoTimeMs?: boolean })?.autoTimeMs ?? false,
						});
					default:
						return Promise.resolve();
				}
			},
			transformCallback: (callback: (...a: unknown[]) => void) => {
				window.__wsListeners.push(callback as (p: unknown) => void);
				return window.__wsListeners.length;
			},
		};
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			value: internals,
			configurable: false,
			writable: false,
		});
	}, opts.cmdPortUrl ?? null);
}

export async function getInvokes(page: Page): Promise<InvokeRecord[]> {
	return page.evaluate(() => window.__invokes ?? []);
}

export async function clearInvokes(page: Page): Promise<void> {
	await page.evaluate(() => {
		window.__invokes = [];
	});
}
