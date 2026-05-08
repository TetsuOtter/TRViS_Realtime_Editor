/**
 * E2E test helpers for interacting with the app (cmd port) and harness (HTTP).
 *
 * Requires the Docker compose stack to be running beforehand:
 *   pnpm harness:up
 *
 * Environment variables:
 *   HARNESS_URL    (default: http://localhost:8080)
 *   APP_CMD_URL    (default: http://localhost:23520)
 */

export const HARNESS_URL = process.env.HARNESS_URL ?? "http://localhost:8080";
export const APP_CMD_URL = process.env.APP_CMD_URL ?? "http://localhost:23520";

/** Wait until the harness /health endpoint returns "ok". */
export async function waitForHarness(timeoutMs = 60_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${HARNESS_URL}/health`);
			if (res.ok) return;
		} catch {
			// not yet up
		}
		await sleep(500);
	}
	throw new Error(`Harness at ${HARNESS_URL} did not become healthy in ${timeoutMs}ms`);
}

/** Send a timetable command to the app's HTTP cmd port. */
export async function sendTimetable(
	data: unknown,
	opts: { workGroupId?: string; workId?: string; trainId?: string } = {},
): Promise<void> {
	const body: Record<string, unknown> = {
		command: "timetable",
		data,
	};
	if (opts.workGroupId !== undefined) body.work_group_id = opts.workGroupId;
	if (opts.workId !== undefined) body.work_id = opts.workId;
	if (opts.trainId !== undefined) body.train_id = opts.trainId;

	const res = await fetch(`${APP_CMD_URL}/cmd`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`POST /cmd failed: ${res.status}`);
}

/** Wait for the harness to have received at least `minCount` messages total. */
export async function waitForMessageCount(minCount: number, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const count = await getMessageCount();
		if (count >= minCount) return;
		await sleep(200);
	}
	throw new Error(`Harness message count did not reach ${minCount} within ${timeoutMs}ms`);
}

export async function getMessageCount(): Promise<number> {
	const res = await fetch(`${HARNESS_URL}/received/message-count`);
	if (!res.ok) throw new Error(`GET /received/message-count failed: ${res.status}`);
	return res.json() as Promise<number>;
}

export async function getWorkGroups(): Promise<unknown[]> {
	const res = await fetch(`${HARNESS_URL}/received/work-groups`);
	if (!res.ok) throw new Error(`GET /received/work-groups failed: ${res.status}`);
	return res.json() as Promise<unknown[]>;
}

export async function getWorkGroup(wgId: string): Promise<unknown> {
	const res = await fetch(`${HARNESS_URL}/received/work-group/${encodeURIComponent(wgId)}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GET /received/work-group failed: ${res.status}`);
	return res.json();
}

export async function getTrain(tId: string): Promise<unknown> {
	const res = await fetch(`${HARNESS_URL}/received/train/${encodeURIComponent(tId)}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GET /received/train failed: ${res.status}`);
	return res.json();
}

export interface PropertyEntry {
	name: string;
	value: unknown;
}

export async function getAllProperties(type: string, id: string): Promise<PropertyEntry[]> {
	const url = `${HARNESS_URL}/received/all-properties?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
	const res = await fetch(url);
	if (res.status === 404) return [];
	if (!res.ok) throw new Error(`GET /received/all-properties failed: ${res.status} ${url}`);
	return res.json() as Promise<PropertyEntry[]>;
}

export async function getPropertyNames(type: string): Promise<string[]> {
	const res = await fetch(
		`${HARNESS_URL}/received/property-names?type=${encodeURIComponent(type)}`,
	);
	if (!res.ok) throw new Error(`GET /received/property-names failed: ${res.status}`);
	return res.json() as Promise<string[]>;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
