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

/** 列番から数字以外の文字 (英字サフィックス等、例: "1M" の "M") を取り除く。 */
const extractDigits = (s: string): string => s.replace(/\D+/g, "");

/**
 * `MatchMode` の意味論に従い、列番の数字部分が検索語 (の数字部分) に一致するかを判定する。
 * 列番の英字サフィックス (例: "1M" の "M") は比較対象に含めない — 「1」で完全一致検索した
 * とき「1M」がヒットするのはこのため。省略・未知の値は "Prefix" として扱う (プロトコル準拠)。
 */
const matchesTrainNumber = (
	candidateDigits: string,
	needleDigits: string,
	matchMode: TrainSearchMatchMode | null | undefined,
): boolean => {
	switch (matchMode) {
		case "Contains":
			return candidateDigits.includes(needleDigits);
		case "Exact":
			return candidateDigits === needleDigits;
		default:
			return candidateDigits.startsWith(needleDigits);
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
 * 全 WorkGroup/Work/Train を走査し、列番の数字部分が `matchMode` に従って一致する候補を
 * 列挙する (英字サフィックスは比較対象外)。同一列番で複数行路にまたがる候補もすべて返す
 * (TRViS 本体 PR #304 の想定どおり)。`matchMode` 省略・未知の値は "Prefix" (前方一致、既定)
 * として扱う (プロトコル準拠。準拠サーバーは Prefix/Contains/Exact の3種すべてを実装する)。
 */
export function searchTrainsByNumber(
	workGroups: WorkGroupData[],
	trainNumber: string,
	matchMode?: TrainSearchMatchMode | null,
): TrainSearchResultSummary[] {
	const needleDigits = extractDigits(trainNumber);
	if (needleDigits === "") return [];

	const results: TrainSearchResultSummary[] = [];
	for (const wg of workGroups) {
		for (const work of wg.Works) {
			for (const train of work.Trains) {
				const candidateDigits = extractDigits(train.TrainNumber ?? "");
				if (!matchesTrainNumber(candidateDigits, needleDigits, matchMode)) continue;
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
