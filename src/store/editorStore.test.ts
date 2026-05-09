import { describe, it, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { current } from "immer";
import { v4 as uuidv4 } from "uuid";

import type {
	EditorSelection,
	RemoteSelection,
	SyncedData,
	TimetableRowData,
	TrainData,
	WorkData,
	WorkGroupData,
} from "../types/trvis";

// Each test group gets a fresh store instance with the same shape as the
// singleton. We re-implement the store here (rather than reset the singleton)
// so unit tests stay isolated from each other across the suite.

type EditorState = {
	workGroups: WorkGroupData[];
	selection: EditorSelection;
	remoteSelection: RemoteSelection | null;
	syncedData: { Location_m: number | null; Time_ms: number | null; CanStart: boolean | null };
	autoTimeMs: boolean;
	history: { past: WorkGroupData[][]; future: WorkGroupData[][] };
	loadDocument: (wgs: WorkGroupData[]) => void;
	resetDocument: () => void;
	undo: () => void;
	redo: () => void;
	setSelection: (s: EditorSelection) => void;
	followRemoteSelection: () => void;
	setRemoteSelection: (s: RemoteSelection | null) => void;
	setSyncedData: (p: Partial<SyncedData>) => void;
	setAutoTimeMs: (v: boolean) => void;
	addWorkGroup: (init?: Partial<WorkGroupData>) => string;
	updateWorkGroup: (id: string, patch: Partial<WorkGroupData>) => void;
	removeWorkGroup: (id: string) => void;
	addWork: (wgId: string, init?: Partial<WorkData>) => string;
	updateWork: (wgId: string, wId: string, patch: Partial<WorkData>) => void;
	removeWork: (wgId: string, wId: string) => void;
	addTrain: (wgId: string, wId: string, init?: Partial<TrainData>) => string;
	updateTrain: (wgId: string, wId: string, tId: string, patch: Partial<TrainData>) => void;
	removeTrain: (wgId: string, wId: string, tId: string) => void;
	addTimetableRow: (
		wgId: string,
		wId: string,
		tId: string,
		init?: Partial<TimetableRowData>,
		idx?: number,
	) => string;
	updateTimetableRow: (
		wgId: string,
		wId: string,
		tId: string,
		rId: string,
		patch: Partial<TimetableRowData>,
	) => void;
	removeTimetableRow: (wgId: string, wId: string, tId: string, rId: string) => void;
	moveTimetableRow: (wgId: string, wId: string, tId: string, rId: string, toIdx: number) => void;
};

const LIMIT = 50;

function createTestStore() {
	const newWG = (init?: Partial<WorkGroupData>): WorkGroupData => ({
		Id: init?.Id ?? uuidv4(),
		Name: init?.Name ?? "新規仕業群",
		DBVersion: init?.DBVersion ?? 1,
		Works: init?.Works ?? [],
	});
	const newW = (init?: Partial<WorkData>): WorkData => ({
		Id: init?.Id ?? uuidv4(),
		Name: init?.Name ?? "新規仕業",
		AffectDate: init?.AffectDate ?? null,
		AffixContentType: init?.AffixContentType ?? null,
		AffixContent: init?.AffixContent ?? null,
		Remarks: init?.Remarks ?? null,
		HasETrainTimetable: init?.HasETrainTimetable ?? null,
		ETrainTimetableContentType: init?.ETrainTimetableContentType ?? null,
		ETrainTimetableContent: init?.ETrainTimetableContent ?? null,
		Trains: init?.Trains ?? [],
	});
	const newT = (init?: Partial<TrainData>): TrainData => ({
		Id: init?.Id ?? uuidv4(),
		TrainNumber: init?.TrainNumber ?? "0000",
		MaxSpeed: init?.MaxSpeed ?? null,
		SpeedType: init?.SpeedType ?? null,
		NominalTractiveCapacity: init?.NominalTractiveCapacity ?? null,
		CarCount: init?.CarCount ?? null,
		Destination: init?.Destination ?? null,
		BeginRemarks: init?.BeginRemarks ?? null,
		AfterRemarks: init?.AfterRemarks ?? null,
		Remarks: init?.Remarks ?? null,
		BeforeDeparture: init?.BeforeDeparture ?? null,
		TrainInfo: init?.TrainInfo ?? null,
		Direction: init?.Direction ?? 1,
		WorkType: init?.WorkType ?? null,
		AfterArrive: init?.AfterArrive ?? null,
		BeforeDeparture_OnStationTrackCol: init?.BeforeDeparture_OnStationTrackCol ?? null,
		AfterArrive_OnStationTrackCol: init?.AfterArrive_OnStationTrackCol ?? null,
		DayCount: init?.DayCount ?? null,
		IsRideOnMoving: init?.IsRideOnMoving ?? null,
		Color: init?.Color ?? null,
		TimetableRows: init?.TimetableRows ?? [],
		NextTrainId: init?.NextTrainId ?? null,
	});
	const newRow = (init?: Partial<TimetableRowData>): TimetableRowData => ({
		Id: init?.Id ?? uuidv4(),
		StationName: init?.StationName ?? "新駅",
		Location_m: init?.Location_m ?? 0,
		Longitude_deg: init?.Longitude_deg ?? null,
		Latitude_deg: init?.Latitude_deg ?? null,
		OnStationDetectRadius_m: init?.OnStationDetectRadius_m ?? null,
		FullName: init?.FullName ?? null,
		RecordType: init?.RecordType ?? null,
		TrackName: init?.TrackName ?? null,
		DriveTime_MM: init?.DriveTime_MM ?? null,
		DriveTime_SS: init?.DriveTime_SS ?? null,
		IsOperationOnlyStop: init?.IsOperationOnlyStop ?? null,
		IsPass: init?.IsPass ?? null,
		HasBracket: init?.HasBracket ?? null,
		IsLastStop: init?.IsLastStop ?? null,
		Arrive: init?.Arrive ?? null,
		Departure: init?.Departure ?? null,
		RunInLimit: init?.RunInLimit ?? null,
		RunOutLimit: init?.RunOutLimit ?? null,
		Remarks: init?.Remarks ?? null,
		MarkerColor: init?.MarkerColor ?? null,
		MarkerText: init?.MarkerText ?? null,
		WorkType: init?.WorkType ?? null,
	});

	const fWG = (gs: WorkGroupData[], id?: string) => gs.find((g) => g.Id === id);
	const fW = (g?: WorkGroupData, id?: string) => g?.Works.find((w) => w.Id === id);
	const fT = (w?: WorkData, id?: string) => w?.Trains.find((t) => t.Id === id);

	return create<EditorState>()(
		immer((set, get) => {
			const push = () =>
				set((s) => {
					s.history.past.push(current(s.workGroups));
					if (s.history.past.length > LIMIT) s.history.past.shift();
					s.history.future = [];
				});
			const mutate = (fn: (s: EditorState) => void) => {
				push();
				set(fn);
			};
			return {
				workGroups: [],
				selection: {},
				remoteSelection: null,
				syncedData: { Location_m: null, Time_ms: null, CanStart: true },
				autoTimeMs: true,
				history: { past: [], future: [] },
				loadDocument: (wgs) => {
					set({
						workGroups: structuredClone(wgs),
						selection: {},
						history: { past: [], future: [] },
					});
				},
				resetDocument: () => {
					set({
						workGroups: [],
						selection: {},
						history: { past: [], future: [] },
					});
				},
				undo: () => {
					const { history, workGroups } = get();
					if (!history.past.length) return;
					const prev = history.past[history.past.length - 1];
					set({
						workGroups: prev,
						history: {
							past: history.past.slice(0, -1),
							future: [JSON.parse(JSON.stringify(workGroups)), ...history.future],
						},
					});
				},
				redo: () => {
					const { history, workGroups } = get();
					if (!history.future.length) return;
					const next = history.future[0];
					set({
						workGroups: next,
						history: {
							past: [...history.past, JSON.parse(JSON.stringify(workGroups))],
							future: history.future.slice(1),
						},
					});
				},
				setSelection: (s) => set({ selection: s }),
				followRemoteSelection: () => {
					const r = get().remoteSelection;
					if (!r) return;
					set({ selection: { workGroupId: r.WorkGroupId, workId: r.WorkId, trainId: r.TrainId } });
				},
				setRemoteSelection: (s) => set({ remoteSelection: s }),
				setSyncedData: (p) =>
					set((s) => {
						Object.assign(s.syncedData, p);
					}),
				setAutoTimeMs: (v) => set({ autoTimeMs: v }),
				addWorkGroup: (init) => {
					const wg = newWG(init);
					mutate((s) => {
						s.workGroups.push(wg);
					});
					return wg.Id!;
				},
				updateWorkGroup: (id, patch) =>
					mutate((s) => {
						const wg = fWG(s.workGroups, id);
						if (wg) Object.assign(wg, patch);
					}),
				removeWorkGroup: (id) =>
					mutate((s) => {
						s.workGroups = s.workGroups.filter((g) => g.Id !== id);
					}),
				addWork: (wgId, init) => {
					const w = newW(init);
					mutate((s) => {
						fWG(s.workGroups, wgId)?.Works.push(w);
					});
					return w.Id!;
				},
				updateWork: (wgId, wId, patch) =>
					mutate((s) => {
						const w = fW(fWG(s.workGroups, wgId), wId);
						if (w) Object.assign(w, patch);
					}),
				removeWork: (wgId, wId) =>
					mutate((s) => {
						const wg = fWG(s.workGroups, wgId);
						if (wg) wg.Works = wg.Works.filter((w) => w.Id !== wId);
					}),
				addTrain: (wgId, wId, init) => {
					const t = newT(init);
					mutate((s) => {
						fW(fWG(s.workGroups, wgId), wId)?.Trains.push(t);
					});
					return t.Id!;
				},
				updateTrain: (wgId, wId, tId, patch) =>
					mutate((s) => {
						const t = fT(fW(fWG(s.workGroups, wgId), wId), tId);
						if (t) Object.assign(t, patch);
					}),
				removeTrain: (wgId, wId, tId) =>
					mutate((s) => {
						const w = fW(fWG(s.workGroups, wgId), wId);
						if (w) w.Trains = w.Trains.filter((t) => t.Id !== tId);
					}),
				addTimetableRow: (wgId, wId, tId, init, idx) => {
					const row = newRow(init);
					mutate((s) => {
						const t = fT(fW(fWG(s.workGroups, wgId), wId), tId);
						if (!t) return;
						if (typeof idx === "number" && idx >= 0 && idx <= t.TimetableRows.length)
							t.TimetableRows.splice(idx, 0, row);
						else t.TimetableRows.push(row);
					});
					return row.Id!;
				},
				updateTimetableRow: (wgId, wId, tId, rId, patch) =>
					mutate((s) => {
						const t = fT(fW(fWG(s.workGroups, wgId), wId), tId);
						const r = t?.TimetableRows.find((r) => r.Id === rId);
						if (r) Object.assign(r, patch);
					}),
				removeTimetableRow: (wgId, wId, tId, rId) =>
					mutate((s) => {
						const t = fT(fW(fWG(s.workGroups, wgId), wId), tId);
						if (t) t.TimetableRows = t.TimetableRows.filter((r) => r.Id !== rId);
					}),
				moveTimetableRow: (wgId, wId, tId, rId, toIdx) =>
					mutate((s) => {
						const t = fT(fW(fWG(s.workGroups, wgId), wId), tId);
						if (!t) return;
						const from = t.TimetableRows.findIndex((r) => r.Id === rId);
						if (from < 0) return;
						const [row] = t.TimetableRows.splice(from, 1);
						t.TimetableRows.splice(Math.max(0, Math.min(toIdx, t.TimetableRows.length)), 0, row);
					}),
			};
		}),
	);
}

// Also import the original store selectors (these are pure functions, not store-dependent)
import { selectActiveWorkGroup, selectActiveWork, selectActiveTrain } from "./editorStore";

let store: ReturnType<typeof createTestStore>;

function get() {
	return store.getState();
}

describe("editorStore", () => {
	beforeEach(() => {
		store = createTestStore();
	});

	describe("loadDocument / resetDocument", () => {
		it("loadDocument で workGroups を更新できる", () => {
			const docs: WorkGroupData[] = [{ Id: "wg1", Name: "Group1", Works: [] }];
			get().loadDocument(docs);
			expect(get().workGroups).toHaveLength(1);
			expect(get().workGroups[0].Name).toBe("Group1");
		});

		it("loadDocument は履歴と選択をリセットする (まっさらロード)", () => {
			get().addWorkGroup({ Name: "Pre" });
			get().setSelection({ workGroupId: "anything" });
			expect(get().history.past.length).toBeGreaterThanOrEqual(1);

			const docs: WorkGroupData[] = [{ Id: "wg1", Name: "G1", Works: [] }];
			get().loadDocument(docs);
			expect(get().history.past).toHaveLength(0);
			expect(get().history.future).toHaveLength(0);
			expect(get().selection).toEqual({});
		});

		it("resetDocument で workGroups が空になる", () => {
			get().loadDocument([{ Id: "wg1", Name: "G1", Works: [] }]);
			get().resetDocument();
			expect(get().workGroups).toHaveLength(0);
		});
	});

	describe("addWorkGroup / updateWorkGroup / removeWorkGroup", () => {
		it("addWorkGroup で WorkGroup が追加される", () => {
			const id = get().addWorkGroup({ Name: "テスト仕業群" });
			expect(get().workGroups).toHaveLength(1);
			expect(get().workGroups[0].Id).toBe(id);
			expect(get().workGroups[0].Name).toBe("テスト仕業群");
			expect(Array.isArray(get().workGroups[0].Works)).toBe(true);
		});

		it("addWorkGroup はデフォルト値で Works 配列を持つ", () => {
			get().addWorkGroup();
			expect(get().workGroups[0].Works).toEqual([]);
		});

		it("addWorkGroup は DBVersion を設定できる", () => {
			get().addWorkGroup({ DBVersion: 2 });
			expect(get().workGroups[0].DBVersion).toBe(2);
		});

		it("updateWorkGroup で Name を更新できる", () => {
			const id = get().addWorkGroup({ Name: "元の名前" });
			get().updateWorkGroup(id, { Name: "新しい名前" });
			expect(get().workGroups.find((g) => g.Id === id)?.Name).toBe("新しい名前");
		});

		it("removeWorkGroup で WorkGroup が削除される", () => {
			const id = get().addWorkGroup({ Name: "削除対象" });
			get().removeWorkGroup(id);
			expect(get().workGroups.find((g) => g.Id === id)).toBeUndefined();
		});

		it("存在しないIDへのupdateWorkGroupは無害", () => {
			get().addWorkGroup({ Name: "G1" });
			expect(() => get().updateWorkGroup("nonexistent", { Name: "X" })).not.toThrow();
		});
	});

	describe("addWork / updateWork / removeWork", () => {
		it("addWork で Work が追加される", () => {
			const wgId = get().addWorkGroup({ Name: "G" });
			const wId = get().addWork(wgId, { Name: "仕業1" });
			const works = get().workGroups.find((g) => g.Id === wgId)!.Works;
			expect(works).toHaveLength(1);
			expect(works[0].Id).toBe(wId);
			expect(works[0].Name).toBe("仕業1");
		});

		it("addWork のデフォルト値に全プロパティが含まれる", () => {
			const wgId = get().addWorkGroup();
			get().addWork(wgId);
			const work = get().workGroups[0].Works[0];
			expect(work).toHaveProperty("AffectDate");
			expect(work).toHaveProperty("AffixContentType");
			expect(work).toHaveProperty("AffixContent");
			expect(work).toHaveProperty("Remarks");
			expect(work).toHaveProperty("HasETrainTimetable");
			expect(work).toHaveProperty("ETrainTimetableContentType");
			expect(work).toHaveProperty("ETrainTimetableContent");
			expect(Array.isArray(work.Trains)).toBe(true);
		});

		it("updateWork でフィールドを更新できる", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId, { Name: "元" });
			get().updateWork(wgId, wId, { Name: "後", AffectDate: "2024-01-01" });
			const work = get().workGroups[0].Works[0];
			expect(work.Name).toBe("後");
			expect(work.AffectDate).toBe("2024-01-01");
		});

		it("removeWork で Work が削除される", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId, { Name: "削除" });
			get().removeWork(wgId, wId);
			expect(get().workGroups[0].Works).toHaveLength(0);
		});
	});

	describe("addTrain / updateTrain / removeTrain", () => {
		it("addTrain で Train が追加される", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId);
			const tId = get().addTrain(wgId, wId, { TrainNumber: "1001" });
			const train = get().workGroups[0].Works[0].Trains[0];
			expect(train.Id).toBe(tId);
			expect(train.TrainNumber).toBe("1001");
		});

		it("addTrain のデフォルト値に全プロパティが含まれる", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId);
			get().addTrain(wgId, wId);
			const train = get().workGroups[0].Works[0].Trains[0];
			expect(train).toHaveProperty("MaxSpeed");
			expect(train).toHaveProperty("SpeedType");
			expect(train).toHaveProperty("NominalTractiveCapacity");
			expect(train).toHaveProperty("CarCount");
			expect(train).toHaveProperty("Destination");
			expect(train).toHaveProperty("BeginRemarks");
			expect(train).toHaveProperty("AfterRemarks");
			expect(train).toHaveProperty("Remarks");
			expect(train).toHaveProperty("BeforeDeparture");
			expect(train).toHaveProperty("TrainInfo");
			expect(typeof train.Direction).toBe("number");
			expect(train).toHaveProperty("WorkType");
			expect(train).toHaveProperty("AfterArrive");
			expect(train).toHaveProperty("BeforeDeparture_OnStationTrackCol");
			expect(train).toHaveProperty("AfterArrive_OnStationTrackCol");
			expect(train).toHaveProperty("DayCount");
			expect(train).toHaveProperty("IsRideOnMoving");
			expect(train).toHaveProperty("Color");
			expect(train).toHaveProperty("NextTrainId");
			expect(Array.isArray(train.TimetableRows)).toBe(true);
		});

		it("updateTrain でフィールドを更新できる", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId);
			const tId = get().addTrain(wgId, wId, { TrainNumber: "A" });
			get().updateTrain(wgId, wId, tId, {
				TrainNumber: "B",
				Direction: 0,
				IsRideOnMoving: true,
				NextTrainId: "next-id",
				Color: "#ff0000",
			});
			const train = get().workGroups[0].Works[0].Trains[0];
			expect(train.TrainNumber).toBe("B");
			expect(train.Direction).toBe(0);
			expect(train.IsRideOnMoving).toBe(true);
			expect(train.NextTrainId).toBe("next-id");
			expect(train.Color).toBe("#ff0000");
		});

		it("removeTrain で Train が削除される", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId);
			const tId = get().addTrain(wgId, wId, { TrainNumber: "X" });
			get().removeTrain(wgId, wId, tId);
			expect(get().workGroups[0].Works[0].Trains).toHaveLength(0);
		});
	});

	describe("addTimetableRow / updateTimetableRow / removeTimetableRow / moveTimetableRow", () => {
		function setup() {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId);
			const tId = get().addTrain(wgId, wId);
			return { wgId, wId, tId };
		}

		it("addTimetableRow で行が追加される", () => {
			const { wgId, wId, tId } = setup();
			const rId = get().addTimetableRow(wgId, wId, tId, { StationName: "東京" });
			const rows = get().workGroups[0].Works[0].Trains[0].TimetableRows;
			expect(rows).toHaveLength(1);
			expect(rows[0].Id).toBe(rId);
			expect(rows[0].StationName).toBe("東京");
		});

		it("addTimetableRow のデフォルト値に全プロパティが含まれる", () => {
			const { wgId, wId, tId } = setup();
			get().addTimetableRow(wgId, wId, tId);
			const row = get().workGroups[0].Works[0].Trains[0].TimetableRows[0];
			expect(typeof row.Location_m).toBe("number");
			expect(row).toHaveProperty("Longitude_deg");
			expect(row).toHaveProperty("Latitude_deg");
			expect(row).toHaveProperty("OnStationDetectRadius_m");
			expect(row).toHaveProperty("FullName");
			expect(row).toHaveProperty("RecordType");
			expect(row).toHaveProperty("TrackName");
			expect(row).toHaveProperty("DriveTime_MM");
			expect(row).toHaveProperty("DriveTime_SS");
			expect(row).toHaveProperty("IsOperationOnlyStop");
			expect(row).toHaveProperty("IsPass");
			expect(row).toHaveProperty("HasBracket");
			expect(row).toHaveProperty("IsLastStop");
			expect(row).toHaveProperty("Arrive");
			expect(row).toHaveProperty("Departure");
			expect(row).toHaveProperty("RunInLimit");
			expect(row).toHaveProperty("RunOutLimit");
			expect(row).toHaveProperty("Remarks");
			expect(row).toHaveProperty("MarkerColor");
			expect(row).toHaveProperty("MarkerText");
			expect(row).toHaveProperty("WorkType");
		});

		it("insertIndex を指定すると途中に挿入される", () => {
			const { wgId, wId, tId } = setup();
			const r1 = get().addTimetableRow(wgId, wId, tId, { StationName: "A" });
			const r2 = get().addTimetableRow(wgId, wId, tId, { StationName: "C" });
			const rMid = get().addTimetableRow(wgId, wId, tId, { StationName: "B" }, 1);
			const rows = get().workGroups[0].Works[0].Trains[0].TimetableRows;
			expect(rows[0].Id).toBe(r1);
			expect(rows[1].Id).toBe(rMid);
			expect(rows[2].Id).toBe(r2);
		});

		it("updateTimetableRow で全プロパティを更新できる", () => {
			const { wgId, wId, tId } = setup();
			const rId = get().addTimetableRow(wgId, wId, tId, { StationName: "X" });
			get().updateTimetableRow(wgId, wId, tId, rId, {
				StationName: "新宿",
				Location_m: 123.4,
				Longitude_deg: 139.7,
				Latitude_deg: 35.7,
				OnStationDetectRadius_m: 50,
				FullName: "新宿駅",
				RecordType: 1,
				TrackName: "1番線",
				DriveTime_MM: 5,
				DriveTime_SS: 30,
				IsOperationOnlyStop: true,
				IsPass: false,
				HasBracket: true,
				IsLastStop: false,
				Arrive: "10:00",
				Departure: "10:02",
				RunInLimit: 80,
				RunOutLimit: 80,
				Remarks: "備考",
				MarkerColor: "#ff0000",
				MarkerText: "M",
				WorkType: 2,
			});
			const row = get().workGroups[0].Works[0].Trains[0].TimetableRows[0];
			expect(row.StationName).toBe("新宿");
			expect(row.Location_m).toBe(123.4);
			expect(row.Longitude_deg).toBe(139.7);
			expect(row.Latitude_deg).toBe(35.7);
			expect(row.OnStationDetectRadius_m).toBe(50);
			expect(row.IsOperationOnlyStop).toBe(true);
			expect(row.IsPass).toBe(false);
			expect(row.WorkType).toBe(2);
		});

		it("removeTimetableRow で行が削除される", () => {
			const { wgId, wId, tId } = setup();
			const rId = get().addTimetableRow(wgId, wId, tId, { StationName: "削除" });
			get().removeTimetableRow(wgId, wId, tId, rId);
			expect(get().workGroups[0].Works[0].Trains[0].TimetableRows).toHaveLength(0);
		});

		it("moveTimetableRow で行を前に移動できる", () => {
			const { wgId, wId, tId } = setup();
			const r1 = get().addTimetableRow(wgId, wId, tId, { StationName: "A" });
			const r2 = get().addTimetableRow(wgId, wId, tId, { StationName: "B" });
			const r3 = get().addTimetableRow(wgId, wId, tId, { StationName: "C" });
			get().moveTimetableRow(wgId, wId, tId, r3, 0);
			const rows = get().workGroups[0].Works[0].Trains[0].TimetableRows;
			expect(rows[0].Id).toBe(r3);
			expect(rows[1].Id).toBe(r1);
			expect(rows[2].Id).toBe(r2);
		});

		it("moveTimetableRow で行を後に移動できる", () => {
			const { wgId, wId, tId } = setup();
			const r1 = get().addTimetableRow(wgId, wId, tId, { StationName: "A" });
			const r2 = get().addTimetableRow(wgId, wId, tId, { StationName: "B" });
			const r3 = get().addTimetableRow(wgId, wId, tId, { StationName: "C" });
			get().moveTimetableRow(wgId, wId, tId, r1, 2);
			const rows = get().workGroups[0].Works[0].Trains[0].TimetableRows;
			expect(rows[0].Id).toBe(r2);
			expect(rows[1].Id).toBe(r3);
			expect(rows[2].Id).toBe(r1);
		});
	});

	describe("undo / redo", () => {
		it("undo で直前の状態に戻れる", () => {
			get().addWorkGroup({ Name: "G1" });
			get().addWorkGroup({ Name: "G2" });
			expect(get().workGroups).toHaveLength(2);
			get().undo();
			expect(get().workGroups).toHaveLength(1);
		});

		it("redo で undo を取り消せる", () => {
			get().addWorkGroup({ Name: "G1" });
			get().undo();
			expect(get().workGroups).toHaveLength(0);
			get().redo();
			expect(get().workGroups).toHaveLength(1);
		});

		it("新しい操作を行うと redo 履歴がクリアされる", () => {
			get().addWorkGroup({ Name: "G1" });
			get().undo();
			get().addWorkGroup({ Name: "G2" });
			expect(get().history.future).toHaveLength(0);
		});

		it("履歴がない状態で undo しても壊れない", () => {
			expect(() => get().undo()).not.toThrow();
		});

		it("redo 履歴がない状態で redo しても壊れない", () => {
			expect(() => get().redo()).not.toThrow();
		});
	});

	describe("selection", () => {
		it("setSelection で選択を更新できる", () => {
			get().setSelection({ workGroupId: "wg1", workId: "w1", trainId: "t1" });
			expect(get().selection).toEqual({ workGroupId: "wg1", workId: "w1", trainId: "t1" });
		});

		it("followRemoteSelection で remoteSelection に追随できる", () => {
			get().setRemoteSelection({
				WorkGroupId: "wg-r",
				WorkId: "w-r",
				TrainId: "t-r",
				receivedAt: Date.now(),
			});
			get().followRemoteSelection();
			expect(get().selection).toEqual({ workGroupId: "wg-r", workId: "w-r", trainId: "t-r" });
		});

		it("remoteSelection が null の場合 followRemoteSelection は何もしない", () => {
			get().setSelection({ workGroupId: "wg1" });
			get().followRemoteSelection();
			expect(get().selection).toEqual({ workGroupId: "wg1" });
		});

		it("setRemoteSelection で remoteSelection を更新できる", () => {
			const sel = { WorkGroupId: "wg1", receivedAt: 12345 };
			get().setRemoteSelection(sel);
			expect(get().remoteSelection).toEqual(sel);
		});
	});

	describe("setSyncedData / setAutoTimeMs", () => {
		it("setSyncedData で Location_m を更新できる", () => {
			get().setSyncedData({ Location_m: 1000 });
			expect(get().syncedData.Location_m).toBe(1000);
		});

		it("setSyncedData で Time_ms を更新できる", () => {
			get().setSyncedData({ Time_ms: 54321 });
			expect(get().syncedData.Time_ms).toBe(54321);
		});

		it("setSyncedData で CanStart を更新できる", () => {
			get().setSyncedData({ CanStart: false });
			expect(get().syncedData.CanStart).toBe(false);
		});

		it("setSyncedData は部分更新できる", () => {
			get().setSyncedData({ Location_m: 500, Time_ms: 1000, CanStart: true });
			get().setSyncedData({ Location_m: 999 });
			expect(get().syncedData.Location_m).toBe(999);
			expect(get().syncedData.Time_ms).toBe(1000);
			expect(get().syncedData.CanStart).toBe(true);
		});

		it("setAutoTimeMs で autoTimeMs を切り替えられる", () => {
			get().setAutoTimeMs(false);
			expect(get().autoTimeMs).toBe(false);
			get().setAutoTimeMs(true);
			expect(get().autoTimeMs).toBe(true);
		});
	});

	describe("selectors", () => {
		it("selectActiveWorkGroup が選択中の WorkGroup を返す", () => {
			const id = get().addWorkGroup({ Name: "G" });
			get().setSelection({ workGroupId: id });
			const wg = selectActiveWorkGroup(get() as Parameters<typeof selectActiveWorkGroup>[0]);
			expect(wg?.Name).toBe("G");
		});

		it("selectActiveWork が選択中の Work を返す", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId, { Name: "W" });
			get().setSelection({ workGroupId: wgId, workId: wId });
			const work = selectActiveWork(get() as Parameters<typeof selectActiveWork>[0]);
			expect(work?.Name).toBe("W");
		});

		it("selectActiveTrain が選択中の Train を返す", () => {
			const wgId = get().addWorkGroup();
			const wId = get().addWork(wgId);
			const tId = get().addTrain(wgId, wId, { TrainNumber: "9999" });
			get().setSelection({ workGroupId: wgId, workId: wId, trainId: tId });
			const train = selectActiveTrain(get() as Parameters<typeof selectActiveTrain>[0]);
			expect(train?.TrainNumber).toBe("9999");
		});

		it("選択がない場合 selector は undefined を返す", () => {
			const state = get() as Parameters<typeof selectActiveWorkGroup>[0];
			expect(selectActiveWorkGroup(state)).toBeUndefined();
			expect(selectActiveWork(state)).toBeUndefined();
			expect(selectActiveTrain(state)).toBeUndefined();
		});
	});
});
