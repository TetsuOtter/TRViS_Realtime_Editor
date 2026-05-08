/**
 * Smoke tests for the production editorStore singleton.
 *
 * These exercise the live store (not the test re-implementation in
 * editorStore.test.ts) to guard against regressions like the immer-draft +
 * structuredClone bug that silently broke loadDocument / addWorkGroup in v0.1.0.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "./editorStore";

beforeEach(() => {
	useEditorStore.setState({
		workGroups: [],
		selection: {},
		remoteSelection: null,
		history: { past: [], future: [] },
	});
});

describe("editorStore singleton", () => {
	it("addWorkGroup adds a work group", () => {
		const id = useEditorStore.getState().addWorkGroup({ Name: "G" });
		expect(useEditorStore.getState().workGroups).toHaveLength(1);
		expect(useEditorStore.getState().workGroups[0].Id).toBe(id);
	});

	it("loadDocument populates workGroups", () => {
		useEditorStore.getState().loadDocument([
			{ Id: "wg1", Name: "G1", Works: [] },
			{ Id: "wg2", Name: "G2", Works: [] },
		]);
		const wgs = useEditorStore.getState().workGroups;
		expect(wgs).toHaveLength(2);
		expect(wgs.map((w) => w.Id)).toEqual(["wg1", "wg2"]);
	});

	it("loadDocument fills missing Ids so tree clicks can select loaded items", () => {
		useEditorStore.getState().loadDocument([
			{
				Name: "G",
				Works: [
					{
						Name: "W",
						Trains: [
							{
								TrainNumber: "1",
								Direction: 1,
								TimetableRows: [{ StationName: "東京", Location_m: 0 }],
							},
						],
					},
				],
			},
		]);
		const wg = useEditorStore.getState().workGroups[0];
		expect(wg.Id).toBeTruthy();
		expect(wg.Works[0].Id).toBeTruthy();
		expect(wg.Works[0].Trains[0].Id).toBeTruthy();
		expect(wg.Works[0].Trains[0].TimetableRows[0].Id).toBeTruthy();
	});

	it("undo / redo round-trip works after addWorkGroup", () => {
		const s = useEditorStore.getState();
		s.addWorkGroup({ Name: "A" });
		s.addWorkGroup({ Name: "B" });
		expect(useEditorStore.getState().workGroups).toHaveLength(2);
		useEditorStore.getState().undo();
		expect(useEditorStore.getState().workGroups).toHaveLength(1);
		useEditorStore.getState().redo();
		expect(useEditorStore.getState().workGroups).toHaveLength(2);
	});

	it("setSyncedData (return-style updater) still works under immer middleware", () => {
		useEditorStore.getState().setSyncedData({ Location_m: 100 });
		useEditorStore.getState().setSyncedData({ CanStart: false });
		const sd = useEditorStore.getState().syncedData;
		expect(sd.Location_m).toBe(100);
		expect(sd.CanStart).toBe(false);
	});

	it("nested mutations (addWork / addTrain / addTimetableRow) all succeed", () => {
		const s = useEditorStore.getState();
		const wgId = s.addWorkGroup({ Name: "G" });
		const wId = s.addWork(wgId, { Name: "W" });
		const tId = s.addTrain(wgId, wId, { TrainNumber: "1" });
		s.addTimetableRow(wgId, wId, tId, { StationName: "東京" });
		const train = useEditorStore.getState().workGroups[0].Works[0].Trains[0];
		expect(train.TimetableRows).toHaveLength(1);
		expect(train.TimetableRows[0].StationName).toBe("東京");
	});
});
