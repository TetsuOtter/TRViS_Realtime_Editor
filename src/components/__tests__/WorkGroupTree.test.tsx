import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkGroupTree } from "../Tree/WorkGroupTree";
import type { WorkGroupData } from "../../types/trvis";

const addWorkGroupMock = vi.fn().mockReturnValue("new-wg-id");
const addWorkMock = vi.fn().mockReturnValue("new-work-id");
const addTrainMock = vi.fn().mockReturnValue("new-train-id");
const removeWorkGroupMock = vi.fn();
const removeWorkMock = vi.fn();
const removeTrainMock = vi.fn();
const setSelectionMock = vi.fn();

let selectionState = {};

vi.mock("../../store/editorStore", () => ({
	useEditorStore: () => ({
		selection: selectionState,
		setSelection: (s: unknown) => {
			selectionState = s as Record<string, unknown>;
			setSelectionMock(s);
		},
		addWorkGroup: addWorkGroupMock,
		addWork: addWorkMock,
		addTrain: addTrainMock,
		removeWorkGroup: removeWorkGroupMock,
		removeWork: removeWorkMock,
		removeTrain: removeTrainMock,
	}),
}));

const sampleWorkGroups: WorkGroupData[] = [
	{
		Id: "wg-1",
		Name: "テスト仕業群",
		DBVersion: 1,
		Works: [
			{
				Id: "w-1",
				Name: "テスト仕業",
				AffectDate: null,
				AffixContentType: null,
				AffixContent: null,
				Remarks: null,
				HasETrainTimetable: null,
				ETrainTimetableContentType: null,
				ETrainTimetableContent: null,
				Trains: [
					{
						Id: "t-1",
						TrainNumber: "1001",
						Direction: 1,
						TimetableRows: [],
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
						WorkType: null,
						AfterArrive: null,
						BeforeDeparture_OnStationTrackCol: null,
						AfterArrive_OnStationTrackCol: null,
						DayCount: null,
						IsRideOnMoving: null,
						Color: null,
						NextTrainId: null,
					},
				],
			},
		],
	},
];

describe("WorkGroupTree", () => {
	beforeEach(() => {
		selectionState = {};
		addWorkGroupMock.mockClear();
		setSelectionMock.mockClear();
	});

	it("仕業群名が表示される", () => {
		render(<WorkGroupTree workGroups={sampleWorkGroups} />);
		expect(screen.getByText("テスト仕業群")).toBeInTheDocument();
	});

	it("「+ 仕業群を追加」ボタンが表示される", () => {
		render(<WorkGroupTree workGroups={[]} />);
		const addBtn = screen.getByTitle("仕業群を追加");
		expect(addBtn).toBeInTheDocument();
	});

	it("仕業群をクリックすると選択される", () => {
		render(<WorkGroupTree workGroups={sampleWorkGroups} />);
		fireEvent.click(screen.getByText("テスト仕業群"));
		expect(setSelectionMock).toHaveBeenCalledWith(expect.objectContaining({ workGroupId: "wg-1" }));
		expect((selectionState as Record<string, unknown>).workGroupId).toBe("wg-1");
		expect((selectionState as Record<string, unknown>).workId).toBeUndefined();
	});

	it("「+ 仕業群を追加」ボタンをクリックすると addWorkGroup が呼ばれる", () => {
		render(<WorkGroupTree workGroups={[]} />);
		const addBtn = screen.getByTitle("仕業群を追加");
		fireEvent.click(addBtn);
		expect(addWorkGroupMock).toHaveBeenCalled();
	});
});
