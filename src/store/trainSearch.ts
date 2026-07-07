/**
 * `SearchTrain` / `RequestTrainTimetable` (v1.1 列番検索) への応答内容を決める純粋ロジック。
 * (副作用を持つ送信処理から分離してテスト可能にしてある。)
 */

import type {
	TrainData,
	TrainSearchMatchMode,
	TrainSearchResultSummary,
	WorkGroupData,
} from "../types/trvis";

/**
 * `MatchMode` の意味論に従い、列番が検索語に一致するかを判定する。
 * 省略・未知の値は "Prefix" として扱う (プロトコル準拠)。大文字小文字は区別しない。
 */
const matchesTrainNumber = (
	candidate: string,
	needleLower: string,
	matchMode: TrainSearchMatchMode | null | undefined,
): boolean => {
	const candidateLower = candidate.toLowerCase();
	switch (matchMode) {
		case "Contains":
			return candidateLower.includes(needleLower);
		case "Exact":
			return candidateLower === needleLower;
		default:
			return candidateLower.startsWith(needleLower);
	}
};

const trimOrNull = (s: string | null | undefined): string | null => {
	const v = (s ?? "").trim();
	return v === "" ? null : v;
};

/** 先頭行の Departure(無ければArrive)、末尾行の Arrive(無ければDeparture) を表示用時刻とする。 */
const deriveStartEnd = (
	train: TrainData,
): {
	startStationName: string | null;
	startTime: string | null;
	endStationName: string | null;
	endTime: string | null;
} => {
	const rows = train.TimetableRows;
	if (rows.length === 0) {
		return { startStationName: null, startTime: null, endStationName: null, endTime: null };
	}
	const first = rows[0];
	const last = rows[rows.length - 1];
	return {
		startStationName: trimOrNull(first.StationName),
		startTime: trimOrNull(first.Departure) ?? trimOrNull(first.Arrive),
		endStationName: trimOrNull(last.StationName),
		endTime: trimOrNull(last.Arrive) ?? trimOrNull(last.Departure),
	};
};

/**
 * 全 WorkGroup/Work/Train を走査し、列番が `matchMode` に従って一致する候補を列挙する。
 * 同一列番で複数行路にまたがる候補もすべて返す (TRViS 本体 PR #304 の想定どおり)。
 * 大文字小文字は区別しない。`matchMode` 省略・未知の値は "Prefix" (前方一致、既定) として扱う
 * (プロトコル準拠。準拠サーバーは Prefix/Contains/Exact の3種すべてを実装する)。
 */
export function searchTrainsByNumber(
	workGroups: WorkGroupData[],
	trainNumber: string,
	matchMode?: TrainSearchMatchMode | null,
): TrainSearchResultSummary[] {
	const needle = trainNumber.trim();
	if (needle === "") return [];
	const needleLower = needle.toLowerCase();

	const results: TrainSearchResultSummary[] = [];
	for (const wg of workGroups) {
		for (const work of wg.Works) {
			for (const train of work.Trains) {
				const candidate = (train.TrainNumber ?? "").trim();
				if (!matchesTrainNumber(candidate, needleLower, matchMode)) continue;
				const { startStationName, startTime, endStationName, endTime } = deriveStartEnd(train);
				results.push({
					WorkGroupId: wg.Id ?? null,
					WorkId: work.Id ?? null,
					TrainId: train.Id ?? null,
					TrainNumber: train.TrainNumber,
					WorkName: trimOrNull(work.Name),
					Direction: train.Direction,
					StartStationName: startStationName,
					StartTime: startTime,
					EndStationName: endStationName,
					EndTime: endTime,
				});
			}
		}
	}
	return results;
}

export interface FoundTrain {
	workGroupId: string;
	workId: string;
	train: TrainData;
}

/**
 * `RequestTrainTimetable` の WorkGroupId/WorkId/TrainId から完全な列車データを引く。
 * 該当が無ければ null (呼び出し側は無応答とし、クライアントをタイムアウトさせる)。
 */
export function findTrainForTimetable(
	workGroups: WorkGroupData[],
	workGroupId: string,
	workId: string,
	trainId: string,
): FoundTrain | null {
	const wg = workGroups.find((g) => g.Id === workGroupId);
	const work = wg?.Works.find((w) => w.Id === workId);
	const train = work?.Trains.find((t) => t.Id === trainId);
	if (!wg?.Id || !work?.Id || !train) return null;
	return { workGroupId: wg.Id, workId: work.Id, train };
}
