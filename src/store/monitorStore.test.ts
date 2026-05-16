import { describe, it, expect, beforeEach } from "vitest";

import { deriveMessageType, sanitizeHiddenTypes, useMonitorStore } from "./monitorStore";
import type { MonitorFrame } from "../types/trvis";

function frame(json: string, over: Partial<MonitorFrame> = {}): MonitorFrame {
	return { direction: "in", clientId: "c1", json, ts: 1700000000000, ...over };
}

const DEFAULT_SETTINGS = {
	dock: "right" as const,
	sendOnKey: "mod-enter" as const,
	keepFullBodies: false,
	maxEntries: 200,
	showSyncedData: false,
	panelSize: 420,
	hiddenTypes: [] as string[],
};

function resetStore(overrides: Record<string, unknown> = {}) {
	useMonitorStore.setState({
		entries: [],
		syncedEntries: [],
		paused: false,
		search: "",
		open: false,
		settings: { ...DEFAULT_SETTINGS },
		...overrides,
	});
}

describe("deriveMessageType", () => {
	it("returns the MessageType field when present", () => {
		expect(deriveMessageType('{"MessageType":"Timetable","Data":[]}')).toBe("Timetable");
		expect(deriveMessageType('{"MessageType":"SyncedData","Time_ms":1}')).toBe("SyncedData");
	});

	it("labels MessageType-less ID snapshots as IdUpdate", () => {
		expect(deriveMessageType('{"TrainId":"t1"}')).toBe("IdUpdate");
		expect(deriveMessageType('{"WorkGroupId":"wg","WorkId":"w"}')).toBe("IdUpdate");
	});

	it("returns Invalid for non-JSON text", () => {
		expect(deriveMessageType("not json at all")).toBe("Invalid");
		expect(deriveMessageType("")).toBe("Invalid");
	});

	it("returns Unknown for JSON objects without recognizable keys", () => {
		expect(deriveMessageType('{"foo":1}')).toBe("Unknown");
		expect(deriveMessageType("[1,2,3]")).toBe("Unknown");
	});
});

describe("sanitizeHiddenTypes (旧 localStorage 移行)", () => {
	it("strips SyncedData so the stale persisted value cannot disable the toggle", () => {
		expect(sanitizeHiddenTypes(["SyncedData"])).toEqual([]);
		expect(sanitizeHiddenTypes(["Timetable", "SyncedData", "IdUpdate"])).toEqual([
			"Timetable",
			"IdUpdate",
		]);
	});

	it("leaves other hidden types untouched", () => {
		expect(sanitizeHiddenTypes(["Timetable", "Notification"])).toEqual([
			"Timetable",
			"Notification",
		]);
		expect(sanitizeHiddenTypes([])).toEqual([]);
	});
});

describe("monitorStore.pushFrame", () => {
	beforeEach(() => resetStore());

	it("derives messageType and keeps small bodies intact", () => {
		useMonitorStore.getState().pushFrame(frame('{"MessageType":"ServerInfo","Name":"x"}'));
		const e = useMonitorStore.getState().entries;
		expect(e).toHaveLength(1);
		expect(e[0].messageType).toBe("ServerInfo");
		expect(e[0].truncated).toBe(false);
		expect(e[0].body).toBe('{"MessageType":"ServerInfo","Name":"x"}');
	});

	it("truncates oversized bodies at the 64KiB cap and records the original length", () => {
		const big = "x".repeat(70000);
		useMonitorStore.getState().pushFrame(frame(big));
		const e = useMonitorStore.getState().entries[0];
		expect(e.truncated).toBe(true);
		expect(e.body.length).toBe(64 * 1024);
		expect(e.originalLength).toBe(70000);
	});

	it("keeps full bodies when keepFullBodies is enabled", () => {
		resetStore({ settings: { ...DEFAULT_SETTINGS, keepFullBodies: true } });
		const big = "y".repeat(70000);
		useMonitorStore.getState().pushFrame(frame(big));
		const e = useMonitorStore.getState().entries[0];
		expect(e.truncated).toBe(false);
		expect(e.body.length).toBe(70000);
	});

	it("enforces the ring buffer size limit", () => {
		const store = useMonitorStore.getState();
		for (let i = 0; i < 205; i++) store.pushFrame(frame(`{"MessageType":"T","i":${i}}`));
		const e = useMonitorStore.getState().entries;
		expect(e).toHaveLength(200);
		// Oldest entries are dropped; the last pushed one survives.
		expect(e[e.length - 1].body).toContain('"i":204');
	});

	it("does not record while paused", () => {
		useMonitorStore.setState({ paused: true });
		useMonitorStore.getState().pushFrame(frame('{"MessageType":"T"}'));
		expect(useMonitorStore.getState().entries).toHaveLength(0);
	});
});

describe("monitorStore SyncedData isolation", () => {
	beforeEach(() => resetStore());

	it("routes SyncedData into its own buffer, not the main one", () => {
		const store = useMonitorStore.getState();
		store.pushFrame(frame('{"MessageType":"SyncedData","Time_ms":1}'));
		store.pushFrame(frame('{"MessageType":"Timetable","Data":[]}'));
		const s = useMonitorStore.getState();
		expect(s.entries).toHaveLength(1);
		expect(s.entries[0].messageType).toBe("Timetable");
		expect(s.syncedEntries).toHaveLength(1);
		expect(s.syncedEntries[0].messageType).toBe("SyncedData");
	});

	it("a flood of SyncedData never evicts main-buffer entries", () => {
		const store = useMonitorStore.getState();
		store.pushFrame(frame('{"MessageType":"Timetable","Data":[]}'));
		for (let i = 0; i < 1000; i++) {
			store.pushFrame(frame(`{"MessageType":"SyncedData","Time_ms":${i}}`));
		}
		const s = useMonitorStore.getState();
		// The single Timetable entry is still there despite 1000 SyncedData frames.
		expect(s.entries).toHaveLength(1);
		expect(s.entries[0].messageType).toBe("Timetable");
		// SyncedData buffer is independently capped (does not grow unbounded).
		expect(s.syncedEntries.length).toBeLessThanOrEqual(120);
	});

	it("clear() empties both buffers", () => {
		const store = useMonitorStore.getState();
		store.pushFrame(frame('{"MessageType":"SyncedData","Time_ms":1}'));
		store.pushFrame(frame('{"MessageType":"Timetable","Data":[]}'));
		useMonitorStore.getState().clear();
		const s = useMonitorStore.getState();
		expect(s.entries).toHaveLength(0);
		expect(s.syncedEntries).toHaveLength(0);
	});
});

describe("monitorStore.setMaxEntries", () => {
	beforeEach(() => resetStore());

	it("trims existing entries when the limit shrinks", () => {
		const store = useMonitorStore.getState();
		for (let i = 0; i < 50; i++) store.pushFrame(frame(`{"MessageType":"T","i":${i}}`));
		useMonitorStore.getState().setMaxEntries(10);
		const e = useMonitorStore.getState().entries;
		expect(e).toHaveLength(10);
		expect(e[e.length - 1].body).toContain('"i":49');
		expect(useMonitorStore.getState().settings.maxEntries).toBe(10);
	});

	it("clamps out-of-range values", () => {
		useMonitorStore.getState().setMaxEntries(1);
		expect(useMonitorStore.getState().settings.maxEntries).toBe(10);
		useMonitorStore.getState().setMaxEntries(99999);
		expect(useMonitorStore.getState().settings.maxEntries).toBe(5000);
	});
});
