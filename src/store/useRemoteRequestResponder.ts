import { useEffect } from "react";

import {
	respondDiagramInfo,
	respondSearchTrain,
	respondServerInfo,
	sendTrainTimetableTo,
	subscribeWsEvents,
} from "../api/wsServer";
import { useEditorStore } from "./editorStore";
import { buildServerInfoResponse, decideDiagramInfoResponse } from "./remoteInfoResponse";
import { findTrainForTimetable, searchTrainsByNumber } from "./trainSearch";

declare const __APP_VERSION__: string | undefined;

/**
 * TRViS 本体 (commit 8c101e4 以降 / v1.1 列車検索対応後) は WebSocket 経由で
 *   - `{"MessageType":"RequestServerInfo"}`
 *   - `{"MessageType":"RequestDiagramInfo","DiagramId"?:string}`
 *   - `{"MessageType":"SearchTrain","RequestId":string,"TrainNumber":string}`
 *   - `{"MessageType":"RequestTrainTimetable","RequestId":string,"WorkGroupId":string,"WorkId":string,"TrainId":string}`
 * を送ってくることがある。本フックはそれら要求イベントを購読し、
 * ストアに設定されたサーバー情報 / ダイヤ情報 / 列車検索結果を要求元クライアントへ返信する。
 * (ReferenceServer と同様、要求元クライアントだけに送る単一クライアント返信。)
 *
 * 応答内容の判定は `remoteInfoResponse` / `trainSearch` の純粋ロジックに委譲する。
 * ダイヤ情報が未設定、または要求 `DiagramId` が設定値と不一致のときは
 * 無応答 (TRViS は応答が来ないことを許容する)。
 */
export function useRemoteRequestResponder() {
	useEffect(() => {
		let unsub: (() => void) | undefined;
		(async () => {
			unsub = await subscribeWsEvents((ev) => {
				if (ev.type === "request-server-info") {
					const appVersion =
						typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "0.0.0";
					const resp = buildServerInfoResponse(useEditorStore.getState().serverInfo, appVersion);
					respondServerInfo({ clientId: ev.clientId, ...resp }).catch((e) => {
						console.error("auto ServerInfo response failed:", e);
					});
					return;
				}

				if (ev.type === "request-diagram-info") {
					const resp = decideDiagramInfoResponse(
						useEditorStore.getState().diagramInfo,
						ev.diagramId,
					);
					if (!resp) return;
					respondDiagramInfo({ clientId: ev.clientId, ...resp }).catch((e) => {
						console.error("auto DiagramInfo response failed:", e);
					});
					return;
				}

				if (ev.type === "search-train") {
					// RequestId が無ければ相関できないため無応答 (ReferenceServer 準拠)。
					// 機能を無効化している場合も無応答とし、クライアントをタイムアウトさせる。
					if (!ev.requestId || !useEditorStore.getState().serverInfo.TrainSearchEnabled) return;
					const results = searchTrainsByNumber(
						useEditorStore.getState().workGroups,
						ev.trainNumber ?? "",
					);
					// 0件でも必ず応答する (「該当なし」とタイムアウトをクライアントが区別するため)。
					respondSearchTrain({ clientId: ev.clientId, requestId: ev.requestId, results }).catch(
						(e) => {
							console.error("auto SearchTrainResponse failed:", e);
						},
					);
					return;
				}

				if (ev.type === "request-train-timetable") {
					if (
						!ev.workGroupId ||
						!ev.workId ||
						!ev.trainId ||
						!useEditorStore.getState().serverInfo.TrainSearchEnabled
					) {
						return;
					}
					const found = findTrainForTimetable(
						useEditorStore.getState().workGroups,
						ev.workGroupId,
						ev.workId,
						ev.trainId,
					);
					// 該当が無ければ無応答 (クライアントはタイムアウトする)。
					if (!found) return;
					sendTrainTimetableTo({
						clientId: ev.clientId,
						workGroupId: found.workGroupId,
						workId: found.workId,
						train: found.train,
					}).catch((e) => {
						console.error("auto train Timetable response failed:", e);
					});
				}
			});
		})();
		return () => unsub?.();
	}, []);
}
