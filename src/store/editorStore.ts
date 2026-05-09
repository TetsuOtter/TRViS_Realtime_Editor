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

export interface EditorState {
	/* Document */
	workGroups: WorkGroupData[];

	/* Selection (editor-side) */
	selection: EditorSelection;

	/* TRViS-side selection (received via WebSocket) */
	remoteSelection: RemoteSelection | null;

	/* SyncedData broadcast settings */
	syncedData: Required<{
		Location_m: number | null;
		Time_ms: number | null;
		CanStart: boolean | null;
	}>;
	/** Time_ms を wall-clock 由来で自動更新するか */
	autoTimeMs: boolean;

	/**
	 * 編集の度に WorkGroup 全体を自動配信するか (ライブモード)。
	 * TRViS 本体は #214 対応により、自スコープと一致する Timetable 更新では
	 * 選択中の Train / 駅 index / 位置情報を維持して再描画するようになった。
	 */
	liveBroadcast: boolean;

	/* History */
	history: { past: WorkGroupData[][]; future: WorkGroupData[][] };

	/* ----- Actions ----- */
	loadDocument: (workGroups: WorkGroupData[]) => void;
	resetDocument: () => void;
	undo: () => void;
	redo: () => void;

	setSelection: (selection: EditorSelection) => void;
	followRemoteSelection: () => void;
	setRemoteSelection: (sel: RemoteSelection | null) => void;

	setSyncedData: (patch: Partial<SyncedData>) => void;
	setAutoTimeMs: (enabled: boolean) => void;
	setLiveBroadcast: (enabled: boolean) => void;

	addWorkGroup: (init?: Partial<WorkGroupData>) => string;
	updateWorkGroup: (id: string, patch: Partial<WorkGroupData>) => void;
	removeWorkGroup: (id: string) => void;

	addWork: (workGroupId: string, init?: Partial<WorkData>) => string;
	updateWork: (workGroupId: string, workId: string, patch: Partial<WorkData>) => void;
	removeWork: (workGroupId: string, workId: string) => void;

	addTrain: (workGroupId: string, workId: string, init?: Partial<TrainData>) => string;
	updateTrain: (
		workGroupId: string,
		workId: string,
		trainId: string,
		patch: Partial<TrainData>,
	) => void;
	removeTrain: (workGroupId: string, workId: string, trainId: string) => void;

	addTimetableRow: (
		workGroupId: string,
		workId: string,
		trainId: string,
		init?: Partial<TimetableRowData>,
		insertIndex?: number,
	) => string;
	updateTimetableRow: (
		workGroupId: string,
		workId: string,
		trainId: string,
		rowId: string,
		patch: Partial<TimetableRowData>,
	) => void;
	removeTimetableRow: (workGroupId: string, workId: string, trainId: string, rowId: string) => void;
	moveTimetableRow: (
		workGroupId: string,
		workId: string,
		trainId: string,
		rowId: string,
		toIndex: number,
	) => void;
}

const HISTORY_LIMIT = 50;

const newWorkGroup = (init?: Partial<WorkGroupData>): WorkGroupData => ({
	Id: init?.Id ?? uuidv4(),
	Name: init?.Name ?? "新規仕業群",
	DBVersion: init?.DBVersion ?? 1,
	Works: init?.Works ?? [],
});

const newWork = (init?: Partial<WorkData>): WorkData => ({
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

const newTrain = (init?: Partial<TrainData>): TrainData => ({
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

/**
 * 読み込んだJSONに `Id` が無い/`null` の要素があると、ツリーからの選択が
 * `undefined` になりエディタが開けないため、ロード時に欠けているIDをUUIDで補完する。
 */
const normalizeWorkGroups = (workGroups: WorkGroupData[]): WorkGroupData[] =>
	structuredClone(workGroups).map((wg) => ({
		...wg,
		Id: wg.Id ?? uuidv4(),
		Works: (wg.Works ?? []).map((w) => ({
			...w,
			Id: w.Id ?? uuidv4(),
			Trains: (w.Trains ?? []).map((t) => ({
				...t,
				Id: t.Id ?? uuidv4(),
				TimetableRows: (t.TimetableRows ?? []).map((r) => ({
					...r,
					Id: r.Id ?? uuidv4(),
				})),
			})),
		})),
	}));

const findWorkGroup = (
	groups: WorkGroupData[],
	id: string | undefined,
): WorkGroupData | undefined => groups.find((g) => g.Id === id);

const findWork = (group: WorkGroupData | undefined, id: string | undefined) =>
	group?.Works.find((w) => w.Id === id);

const findTrain = (work: WorkData | undefined, id: string | undefined) =>
	work?.Trains.find((t) => t.Id === id);

export const useEditorStore = create<EditorState>()(
	immer((set, get) => {
		const pushHistory = () =>
			set((s) => {
				s.history.past.push(current(s.workGroups));
				if (s.history.past.length > HISTORY_LIMIT) s.history.past.shift();
				s.history.future = [];
			});

		const mutate = (fn: (s: EditorState) => void) => {
			pushHistory();
			set(fn);
		};

		return {
			workGroups: [],
			selection: {},
			remoteSelection: null,
			syncedData: { Location_m: null, Time_ms: null, CanStart: true },
			autoTimeMs: true,
			liveBroadcast: false,
			history: { past: [], future: [] },

			loadDocument: (workGroups) => {
				pushHistory();
				set({ workGroups: normalizeWorkGroups(workGroups) });
			},
			resetDocument: () => {
				pushHistory();
				set({ workGroups: [], selection: {} });
			},
			undo: () => {
				const { history, workGroups } = get();
				if (history.past.length === 0) return;
				const prev = history.past[history.past.length - 1];
				set({
					workGroups: prev,
					history: {
						past: history.past.slice(0, -1),
						future: [structuredClone(workGroups), ...history.future],
					},
				});
			},
			redo: () => {
				const { history, workGroups } = get();
				if (history.future.length === 0) return;
				const next = history.future[0];
				set({
					workGroups: next,
					history: {
						past: [...history.past, structuredClone(workGroups)],
						future: history.future.slice(1),
					},
				});
			},

			setSelection: (selection) => set({ selection }),
			followRemoteSelection: () => {
				const r = get().remoteSelection;
				if (!r) return;
				set({
					selection: {
						workGroupId: r.WorkGroupId,
						workId: r.WorkId,
						trainId: r.TrainId,
					},
				});
			},
			setRemoteSelection: (sel) => set({ remoteSelection: sel }),

			setSyncedData: (patch) => set((s) => ({ syncedData: { ...s.syncedData, ...patch } })),
			setAutoTimeMs: (autoTimeMs) => set({ autoTimeMs }),
			setLiveBroadcast: (liveBroadcast) => set({ liveBroadcast }),

			addWorkGroup: (init) => {
				const wg = newWorkGroup(init);
				mutate((s) => {
					s.workGroups.push(wg);
				});
				return wg.Id!;
			},
			updateWorkGroup: (id, patch) =>
				mutate((s) => {
					const wg = findWorkGroup(s.workGroups, id);
					if (wg) Object.assign(wg, patch);
				}),
			removeWorkGroup: (id) =>
				mutate((s) => {
					s.workGroups = s.workGroups.filter((g) => g.Id !== id);
				}),

			addWork: (workGroupId, init) => {
				const w = newWork(init);
				mutate((s) => {
					const wg = findWorkGroup(s.workGroups, workGroupId);
					wg?.Works.push(w);
				});
				return w.Id!;
			},
			updateWork: (workGroupId, workId, patch) =>
				mutate((s) => {
					const work = findWork(findWorkGroup(s.workGroups, workGroupId), workId);
					if (work) Object.assign(work, patch);
				}),
			removeWork: (workGroupId, workId) =>
				mutate((s) => {
					const wg = findWorkGroup(s.workGroups, workGroupId);
					if (wg) wg.Works = wg.Works.filter((w) => w.Id !== workId);
				}),

			addTrain: (workGroupId, workId, init) => {
				const t = newTrain(init);
				mutate((s) => {
					const work = findWork(findWorkGroup(s.workGroups, workGroupId), workId);
					work?.Trains.push(t);
				});
				return t.Id!;
			},
			updateTrain: (workGroupId, workId, trainId, patch) =>
				mutate((s) => {
					const train = findTrain(
						findWork(findWorkGroup(s.workGroups, workGroupId), workId),
						trainId,
					);
					if (train) Object.assign(train, patch);
				}),
			removeTrain: (workGroupId, workId, trainId) =>
				mutate((s) => {
					const work = findWork(findWorkGroup(s.workGroups, workGroupId), workId);
					if (work) work.Trains = work.Trains.filter((t) => t.Id !== trainId);
				}),

			addTimetableRow: (workGroupId, workId, trainId, init, insertIndex) => {
				const row = newRow(init);
				mutate((s) => {
					const train = findTrain(
						findWork(findWorkGroup(s.workGroups, workGroupId), workId),
						trainId,
					);
					if (!train) return;
					if (
						typeof insertIndex === "number" &&
						insertIndex >= 0 &&
						insertIndex <= train.TimetableRows.length
					) {
						train.TimetableRows.splice(insertIndex, 0, row);
					} else {
						train.TimetableRows.push(row);
					}
				});
				return row.Id!;
			},
			updateTimetableRow: (workGroupId, workId, trainId, rowId, patch) =>
				mutate((s) => {
					const train = findTrain(
						findWork(findWorkGroup(s.workGroups, workGroupId), workId),
						trainId,
					);
					const row = train?.TimetableRows.find((r) => r.Id === rowId);
					if (row) Object.assign(row, patch);
				}),
			removeTimetableRow: (workGroupId, workId, trainId, rowId) =>
				mutate((s) => {
					const train = findTrain(
						findWork(findWorkGroup(s.workGroups, workGroupId), workId),
						trainId,
					);
					if (train) train.TimetableRows = train.TimetableRows.filter((r) => r.Id !== rowId);
				}),
			moveTimetableRow: (workGroupId, workId, trainId, rowId, toIndex) =>
				mutate((s) => {
					const train = findTrain(
						findWork(findWorkGroup(s.workGroups, workGroupId), workId),
						trainId,
					);
					if (!train) return;
					const fromIndex = train.TimetableRows.findIndex((r) => r.Id === rowId);
					if (fromIndex < 0) return;
					const [row] = train.TimetableRows.splice(fromIndex, 1);
					train.TimetableRows.splice(
						Math.max(0, Math.min(toIndex, train.TimetableRows.length)),
						0,
						row,
					);
				}),
		};
	}),
);

/* -------------------------------------------------------------------------- */
/*  Selectors                                                                  */
/* -------------------------------------------------------------------------- */

export const selectActiveWorkGroup = (s: EditorState) =>
	s.selection.workGroupId ? s.workGroups.find((g) => g.Id === s.selection.workGroupId) : undefined;

export const selectActiveWork = (s: EditorState) => {
	const g = selectActiveWorkGroup(s);
	return s.selection.workId ? g?.Works.find((w) => w.Id === s.selection.workId) : undefined;
};

export const selectActiveTrain = (s: EditorState) => {
	const w = selectActiveWork(s);
	return s.selection.trainId ? w?.Trains.find((t) => t.Id === s.selection.trainId) : undefined;
};
