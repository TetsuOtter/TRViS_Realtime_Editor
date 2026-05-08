import { describe, it, expect, beforeAll } from "vitest";
import { buildSentinelFixture, buildSecondWorkGroup } from "./fixture.js";
import {
	waitForHarness,
	sendTimetable,
	waitForMessageCount,
	getMessageCount,
	getWorkGroups,
	getWorkGroup,
	getTrain,
	getAllProperties,
	getPropertyNames,
	HARNESS_URL,
	APP_CMD_URL,
} from "./helpers.js";

beforeAll(async () => {
	await waitForHarness(60_000);
}, 65_000);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: wait for harness message count to grow by 1 after sending
// ─────────────────────────────────────────────────────────────────────────────
async function sendAndWait(fn: () => Promise<void>): Promise<void> {
	const before = await getMessageCount();
	await fn();
	await waitForMessageCount(before + 1, 10_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// All-properties test – property values are validated by looping over
// harness-reported names, so new C# properties are automatically covered.
// ─────────────────────────────────────────────────────────────────────────────
describe("all-properties sentinel test", () => {
	const ARRAY_PROPS = new Set(["Works", "Trains", "TimetableRows"]);

	async function checkAllProps(
		type: string,
		csType: string,
		id: string,
		fixture: Record<string, unknown>,
	): Promise<void> {
		const received = await getAllProperties(type, id);
		expect(received.length).toBeGreaterThan(0);

		const receivedMap = Object.fromEntries(received.map((p) => [p.name, p.value]));
		const harnessNames = await getPropertyNames(csType);
		const fixtureKeys = new Set(Object.keys(fixture));

		for (const name of harnessNames) {
			if (ARRAY_PROPS.has(name)) continue;
			// Coverage guard: every C# property must appear in the fixture
			expect(fixtureKeys, `${csType}.${name} must be in fixture`).toContain(name);
			// Value guard: received value must equal sent value
			expect(receivedMap[name], `${csType}.${name} value`).toEqual(
				(fixture as Record<string, unknown>)[name],
			);
		}
	}

	it("transmits every WorkGroupData property correctly", async () => {
		const fixture = buildSentinelFixture();
		await sendAndWait(() => sendTimetable(fixture));

		const wg = fixture[0];
		await checkAllProps("WorkGroup", "WorkGroupData", wg.Id!, wg as Record<string, unknown>);
	});

	it("transmits every WorkData property correctly", async () => {
		const work = buildSentinelFixture()[0].Works[0];
		await checkAllProps("Work", "WorkData", work.Id!, work as Record<string, unknown>);
	});

	it("transmits every TrainData property correctly", async () => {
		const train = buildSentinelFixture()[0].Works[0].Trains[0];
		await checkAllProps("Train", "TrainData", train.Id!, train as Record<string, unknown>);
	});

	it("transmits every TimetableRowData property correctly", async () => {
		const row = buildSentinelFixture()[0].Works[0].Trains[0].TimetableRows[0];
		await checkAllProps(
			"TimetableRow",
			"TimetableRowData",
			row.Id!,
			row as Record<string, unknown>,
		);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SyncedData test
// ─────────────────────────────────────────────────────────────────────────────
describe("SyncedData test", () => {
	it("receives and reflects SyncedData via sync command", async () => {
		const before = await getMessageCount();

		const body = {
			command: "sync",
			location_m: 12345.5,
			time_ms: 987654,
			can_start: true,
		};
		const res = await fetch(`${APP_CMD_URL}/cmd`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		expect(res.ok).toBe(true);

		await waitForMessageCount(before + 1, 10_000);

		const syncRes = await fetch(`${HARNESS_URL}/received/sync`);
		expect(syncRes.ok).toBe(true);
		const sync = (await syncRes.json()) as {
			Location_m: number;
			Time_ms: number;
			CanStart: boolean;
		};

		expect(sync.Location_m).toBe(12345.5);
		expect(sync.Time_ms).toBe(987654);
		expect(sync.CanStart).toBe(true);
	});

	it("SyncedData property-names includes all expected fields", async () => {
		const names = await getPropertyNames("SyncedData");
		expect(names).toContain("Location_m");
		expect(names).toContain("Time_ms");
		expect(names).toContain("CanStart");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Add / delete / reorder tests
// ─────────────────────────────────────────────────────────────────────────────
describe("add/delete/reorder tests", () => {
	it("adds a second WorkGroup", async () => {
		const existing = buildSentinelFixture();
		const second = buildSecondWorkGroup();
		const updated = [...existing, second];

		await sendAndWait(() => sendTimetable(updated));

		const wgs = (await getWorkGroups()) as Array<{ Id: string }>;
		const ids = wgs.map((w) => w.Id);
		expect(ids).toContain("wg-id-1");
		expect(ids).toContain("wg-id-2");
	});

	it("deletes a WorkGroup via full All-scope resend", async () => {
		const fixture = buildSentinelFixture();
		await sendAndWait(() => sendTimetable(fixture));

		const wgs = (await getWorkGroups()) as Array<{ Id: string }>;
		const ids = wgs.map((w) => w.Id);
		expect(ids).toContain("wg-id-1");
		expect(ids).not.toContain("wg-id-2");
	});

	it("reflects TimetableRow reorder", async () => {
		const fixture = buildSentinelFixture();
		const train = fixture[0].Works[0].Trains[0];

		const reordered = {
			...train,
			TimetableRows: [...train.TimetableRows].reverse(),
		};

		await sendAndWait(() => sendTimetable(reordered, { trainId: train.Id! }));

		const received = (await getTrain(train.Id!)) as {
			TimetableRows: Array<{ Id: string }>;
		};
		expect(received).not.toBeNull();
		const rowIds = received.TimetableRows.map((r) => r.Id);
		expect(rowIds[0]).toBe("row-id-2");
		expect(rowIds[1]).toBe("row-id-1");
	});

	it("deletes a TimetableRow by sending train with fewer rows", async () => {
		const fixture = buildSentinelFixture();
		const train = fixture[0].Works[0].Trains[0];

		const modified = {
			...train,
			TimetableRows: [train.TimetableRows[0]],
		};

		await sendAndWait(() => sendTimetable(modified, { trainId: train.Id! }));

		const received = (await getTrain(train.Id!)) as {
			TimetableRows: Array<{ Id: string }>;
		};
		expect(received.TimetableRows.length).toBe(1);
		expect(received.TimetableRows[0].Id).toBe("row-id-1");
	});

	it("restores full fixture for isolation", async () => {
		const fixture = buildSentinelFixture();
		await sendAndWait(() => sendTimetable(fixture));

		const wg = await getWorkGroup("wg-id-1");
		expect(wg).not.toBeNull();
	});
});
