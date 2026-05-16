import { useEffect } from "react";

import { respondDiagramInfo, respondServerInfo, subscribeWsEvents } from "../api/wsServer";
import { useEditorStore } from "./editorStore";
import { buildServerInfoResponse, decideDiagramInfoResponse } from "./remoteInfoResponse";

declare const __APP_VERSION__: string | undefined;

/**
 * TRViS 本体 (commit 8c101e4 以降) は WebSocket 経由で
 *   - `{"MessageType":"RequestServerInfo"}`
 *   - `{"MessageType":"RequestDiagramInfo","DiagramId"?:string}`
 * を送ってくることがある。本フックはそれら要求イベントを購読し、
 * ストアに設定されたサーバー情報 / ダイヤ情報を要求元クライアントへ返信する。
 * (ReferenceServer と同様、要求元クライアントだけに送る単一クライアント返信。)
 *
 * 応答内容の判定は `remoteInfoResponse` の純粋ロジックに委譲する。
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
				}
			});
		})();
		return () => unsub?.();
	}, []);
}
