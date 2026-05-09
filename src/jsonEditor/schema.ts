/**
 * `WorkGroupData[]` (もしくは単一 `WorkGroupData`) 用の JSON Schema (Draft 7)。
 *
 * - エディタの入力補完 (`codemirror-json-schema`) に使う。
 * - `additionalProperties: true` を明示し、`TRViS.JsonModels` 側で増えたプロパティが
 *   赤線にならないようにしてある。
 * - `required` は TypeScript 側で `?:` の付かない、本当に必須なフィールドのみ。
 */

import type { JSONSchema7 } from "json-schema";

const nullableString: JSONSchema7 = { type: ["string", "null"] };
const nullableNumber: JSONSchema7 = { type: ["number", "null"] };
const nullableInteger: JSONSchema7 = { type: ["integer", "null"] };
const nullableBoolean: JSONSchema7 = { type: ["boolean", "null"] };

const timetableRow: JSONSchema7 = {
	type: "object",
	additionalProperties: true,
	required: ["StationName", "Location_m"],
	properties: {
		Id: nullableString,
		StationName: { type: "string", description: "駅名" },
		Location_m: { type: "number", description: "起点からの距離 (m)" },
		Longitude_deg: nullableNumber,
		Latitude_deg: nullableNumber,
		OnStationDetectRadius_m: nullableNumber,
		FullName: nullableString,
		RecordType: nullableInteger,
		TrackName: nullableString,
		DriveTime_MM: nullableInteger,
		DriveTime_SS: nullableInteger,
		IsOperationOnlyStop: nullableBoolean,
		IsPass: nullableBoolean,
		HasBracket: nullableBoolean,
		IsLastStop: nullableBoolean,
		Arrive: { ...nullableString, description: "到着時刻 (HH:mm:ss)" },
		Departure: { ...nullableString, description: "発車時刻 (HH:mm:ss)" },
		RunInLimit: nullableInteger,
		RunOutLimit: nullableInteger,
		Remarks: nullableString,
		MarkerColor: { ...nullableString, description: "#RRGGBB" },
		MarkerText: nullableString,
		WorkType: nullableInteger,
	},
};

const train: JSONSchema7 = {
	type: "object",
	additionalProperties: true,
	required: ["TrainNumber", "Direction", "TimetableRows"],
	properties: {
		Id: nullableString,
		TrainNumber: { type: "string", description: "列車番号" },
		MaxSpeed: nullableString,
		SpeedType: nullableString,
		NominalTractiveCapacity: nullableString,
		CarCount: nullableInteger,
		Destination: nullableString,
		BeginRemarks: nullableString,
		AfterRemarks: nullableString,
		Remarks: nullableString,
		BeforeDeparture: nullableString,
		TrainInfo: nullableString,
		Direction: {
			type: "integer",
			description: "正の数=下り / 負の数=上り (通常は ±1)",
		},
		WorkType: nullableInteger,
		AfterArrive: nullableString,
		BeforeDeparture_OnStationTrackCol: nullableString,
		AfterArrive_OnStationTrackCol: nullableString,
		DayCount: nullableInteger,
		IsRideOnMoving: nullableBoolean,
		Color: { ...nullableString, description: "#RRGGBB" },
		TimetableRows: {
			type: "array",
			items: timetableRow,
		},
		NextTrainId: nullableString,
	},
};

const work: JSONSchema7 = {
	type: "object",
	additionalProperties: true,
	required: ["Name", "Trains"],
	properties: {
		Id: nullableString,
		Name: { type: "string", description: "仕業名" },
		AffectDate: { ...nullableString, description: "適用日 (YYYY-MM-DD)" },
		AffixContentType: nullableInteger,
		AffixContent: nullableString,
		Remarks: nullableString,
		HasETrainTimetable: nullableBoolean,
		ETrainTimetableContentType: nullableInteger,
		ETrainTimetableContent: nullableString,
		Trains: {
			type: "array",
			items: train,
		},
	},
};

const workGroup: JSONSchema7 = {
	type: "object",
	additionalProperties: true,
	required: ["Name", "Works"],
	properties: {
		Id: nullableString,
		Name: { type: "string", description: "仕業群名" },
		DBVersion: nullableInteger,
		Works: {
			type: "array",
			items: work,
		},
	},
};

/**
 * トップレベルは `WorkGroupData[]` を想定するが、ローダ側は単一オブジェクトも
 * 受け付けるので Schema でも oneOf で両方許容する。
 *
 * これは **CodeMirror の入力補完 / リンタ用** のスキーマ。ユーザの生テキストは
 * 配列か単一オブジェクトのいずれかになり得るため oneOf で表現している。
 */
export const workGroupDocumentSchema: JSONSchema7 = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "TRViS WorkGroup Document",
	oneOf: [
		{
			type: "array",
			items: workGroup,
		},
		workGroup,
	],
};

/**
 * **適用時の検証用** スキーマ。`tryParseDocument` を通った後のデータは必ず
 * `WorkGroupData[]` (単一オブジェクトはラップ済み) になっているので、配列限定で OK。
 *
 * `oneOf` だと json-schema-library が階層下降エラーをまとめて 1 件にしがちなので、
 * 検証時は分岐の無いシンプルな配列スキーマを使うことで複数エラーが個別に出る。
 */
export const workGroupArraySchema: JSONSchema7 = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "TRViS WorkGroup Document (array form)",
	type: "array",
	items: workGroup,
};
