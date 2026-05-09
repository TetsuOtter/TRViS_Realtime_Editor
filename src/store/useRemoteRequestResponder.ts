import { useEffect } from "react";

import { respondServerInfo, subscribeWsEvents } from "../api/wsServer";

const PROTOCOL_VERSION = "1";

declare const __APP_VERSION__: string | undefined;

/**
 * TRViS 本体 (commit 8c101e4 以降) は WebSocket 経由で
 *   - `{"MessageType":"RequestServerInfo"}`
 *   - `{"MessageType":"RequestDiagramInfo","DiagramId"?:string}`
 * を送ってくることがある。本フックはそれら要求イベントを購読し、
 * `RequestServerInfo` に対しては要求元クライアントへ `ServerInfo` を返信する。
 * (ReferenceServer も同様に要求元クライアントだけに送る単一クライアント返信。)
 *
 * `RequestDiagramInfo` についてはエディタにダイヤ概念が存在しないため、
 * 現状は応答しない (ReferenceServer も対象なしの場合は無応答)。
 */
export function useRemoteRequestResponder() {
	useEffect(() => {
		let unsub: (() => void) | undefined;
		(async () => {
			unsub = await subscribeWsEvents((ev) => {
				if (ev.type !== "request-server-info") return;
				const version =
					typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "0.0.0";
				respondServerInfo({
					clientId: ev.clientId,
					name: "TRViS Realtime Editor",
					version,
					protocolVersion: PROTOCOL_VERSION,
				}).catch((e) => {
					console.error("auto ServerInfo response failed:", e);
				});
			});
		})();
		return () => unsub?.();
	}, []);
}
