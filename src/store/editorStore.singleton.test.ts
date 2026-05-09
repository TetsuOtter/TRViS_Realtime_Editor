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

	it("loadDocument resets selection / history and bumps documentVersion (まっさらロード)", () => {
		// Pre-state: 既存のドキュメント / 選択 / undo 履歴がある
		useEditorStore.getState().addWorkGroup({ Name: "Pre" });
		useEditorStore.getState().setSelection({ workGroupId: "stale" });
		expect(useEditorStore.getState().history.past.length).toBeGreaterThan(0);
		const v0 = useEditorStore.getState().documentVersion;

		useEditorStore.getState().loadDocument([{ Id: "wg1", Name: "G1", Works: [] }]);

		const s = useEditorStore.getState();
		expect(s.workGroups.map((w) => w.Name)).toEqual(["G1"]);
		expect(s.selection).toEqual({});
		expect(s.history.past).toHaveLength(0);
		expect(s.history.future).toHaveLength(0);
		expect(s.documentVersion).toBe(v0 + 1);
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

	it("replaceDocument は履歴を残し、生存している選択は維持する", () => {
		useEditorStore.getState().loadDocument([
			{
				Id: "wg",
				Name: "G",
				Works: [
					{
						Id: "w",
						Name: "W",
						Trains: [{ Id: "t", TrainNumber: "1", Direction: 1, TimetableRows: [] }],
					},
				],
			},
		]);
		useEditorStore.setState({ selection: { workGroupId: "wg", workId: "w", trainId: "t" } });

		// 同じ ID の Train を残したまま中身だけ変える
		useEditorStore.getState().replaceDocument([
			{
				Id: "wg",
				Name: "G-new",
				Works: [
					{
						Id: "w",
						Name: "W-new",
						Trains: [{ Id: "t", TrainNumber: "999", Direction: 1, TimetableRows: [] }],
					},
				],
			},
		]);
		const s1 = useEditorStore.getState();
		expect(s1.workGroups[0].Name).toBe("G-new");
		expect(s1.selection).toEqual({ workGroupId: "wg", workId: "w", trainId: "t" });
		// 履歴に直前の状態が積まれている → undo で戻れる
		expect(s1.history.past.length).toBeGreaterThan(0);

		// Train を消したら trainId だけクリアされ、上位 (workGroupId/workId) は残る
		useEditorStore
			.getState()
			.replaceDocument([{ Id: "wg", Name: "G", Works: [{ Id: "w", Name: "W", Trains: [] }] }]);
		const s2 = useEditorStore.getState();
		expect(s2.selection).toEqual({ workGroupId: "wg", workId: "w", trainId: undefined });
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
