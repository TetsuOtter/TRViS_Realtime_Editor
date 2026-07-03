import { describe, it, expect } from "vitest";

import { findTrainForTimetable, searchTrainsByNumber } from "./trainSearch";
import type { TrainData, WorkGroupData } from "../types/trvis";

const train1234a: TrainData = {
	Id: "t-1234a",
	TrainNumber: "1234",
	Direction: 1,
	TimetableRows: [
		{ StationName: "東京", Location_m: 0, Departure: "09:00:00" },
		{ StationName: "名古屋", Location_m: 366000, Arrive: "10:40:00", Departure: "10:41:00" },
		{ StationName: "大阪", Location_m: 515000, Arrive: "12:30:00" },
	],
};

const train1234b: TrainData = {
	Id: "t-1234b",
	TrainNumber: "1234",
	Direction: -1,
	TimetableRows: [
		{ StationName: "新大阪", Location_m: 0, Departure: "13:00:00" },
		{ StationName: "博多", Location_m: 622000, Arrive: "15:30:00" },
	],
};

const train5678: TrainData = {
	Id: "t-5678",
	TrainNumber: "5678",
	Direction: 1,
	TimetableRows: [{ StationName: "名古屋", Location_m: 0, Departure: "10:30:00" }],
};

const trainNoRows: TrainData = {
	Id: "t-empty",
	TrainNumber: "9999",
	Direction: 1,
	TimetableRows: [],
};

const workGroups: WorkGroupData[] = [
	{
		Id: "wg-1",
		Name: "WG1",
		Works: [
			{ Id: "w-1", Name: "1行路", Trains: [train1234a] },
			{ Id: "w-2", Name: "2行路", Trains: [train1234b, trainNoRows] },
		],
	},
	{
		Id: "wg-2",
		Name: "WG2",
		Works: [{ Id: "w-3", Name: "3行路", Trains: [train5678] }],
	},
];

describe("searchTrainsByNumber", () => {
	it("同一列番で複数行路にまたがる候補をすべて返す", () => {
		const results = searchTrainsByNumber(workGroups, "1234");
		expect(results).toHaveLength(2);
		expect(results.map((r) => r.TrainId)).toEqual(["t-1234a", "t-1234b"]);
	});

	it("先頭/末尾の TimetableRows から Start/End を導出する", () => {
		const [result] = searchTrainsByNumber(workGroups, "1234");
		expect(result).toMatchObject({
			WorkGroupId: "wg-1",
			WorkId: "w-1",
			TrainId: "t-1234a",
			TrainNumber: "1234",
			WorkName: "1行路",
			Direction: 1,
			StartStationName: "東京",
			StartTime: "09:00:00",
			EndStationName: "大阪",
			EndTime: "12:30:00",
		});
	});

	it("該当なしは空配列を返す (無応答ではない)", () => {
		expect(searchTrainsByNumber(workGroups, "0000")).toEqual([]);
	});

	it("大文字小文字を区別しない", () => {
		const results = searchTrainsByNumber(
			[
				{
					Id: "wg",
					Name: "WG",
					Works: [
						{
							Id: "w",
							Name: "W",
							Trains: [{ Id: "t", TrainNumber: "AB12", Direction: 1, TimetableRows: [] }],
						},
					],
				},
			],
			"ab12",
		);
		expect(results).toHaveLength(1);
	});

	it("空白のみの検索語は空配列を返す", () => {
		expect(searchTrainsByNumber(workGroups, "  ")).toEqual([]);
	});

	it("TimetableRows が空の列車は Start/End が null になる", () => {
		const results = searchTrainsByNumber(workGroups, "9999");
		expect(results).toEqual([
			{
				WorkGroupId: "wg-1",
				WorkId: "w-2",
				TrainId: "t-empty",
				TrainNumber: "9999",
				WorkName: "2行路",
				Direction: 1,
				StartStationName: null,
				StartTime: null,
				EndStationName: null,
				EndTime: null,
			},
		]);
	});
});

describe("findTrainForTimetable", () => {
	it("WorkGroupId/WorkId/TrainId が一致する列車を返す", () => {
		const found = findTrainForTimetable(workGroups, "wg-1", "w-2", "t-1234b");
		expect(found).toEqual({ workGroupId: "wg-1", workId: "w-2", train: train1234b });
	});

	it("該当が無ければ null", () => {
		expect(findTrainForTimetable(workGroups, "wg-1", "w-1", "nope")).toBeNull();
		expect(findTrainForTimetable(workGroups, "wg-9", "w-1", "t-1234a")).toBeNull();
	});
});
