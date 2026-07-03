/**
 * `RequestServerInfo` / `RequestDiagramInfo` への応答内容を決める純粋ロジック。
 * (副作用を持つ送信処理から分離してテスト可能にしてある。)
 */

import type { EditorDiagramInfo, EditorServerInfo } from "../types/trvis";

const trimOrNull = (s: string | null | undefined): string | null => {
	const v = (s ?? "").trim();
	return v === "" ? null : v;
};

export interface ServerInfoResponse {
	name: string | null;
	admin: string | null;
	version: string | null;
	protocolVersion: string | null;
	/** `TrainSearchEnabled` が true のときのみ `["TrainSearch"]`、それ以外は null (拡張機能なし)。 */
	features: string[] | null;
}

/**
 * `Version` 空欄時はアプリ版を、`ProtocolVersion` 空欄時は現行 "1.1" を補う。
 * `Features` は `TrainSearchEnabled` に従って `["TrainSearch"]` / null を返す。
 */
export function buildServerInfoResponse(
	info: EditorServerInfo,
	appVersion: string,
): ServerInfoResponse {
	return {
		name: trimOrNull(info.Name),
		admin: trimOrNull(info.Admin),
		version: trimOrNull(info.Version) ?? appVersion,
		protocolVersion: trimOrNull(info.ProtocolVersion) ?? "1.1",
		features: info.TrainSearchEnabled ? ["TrainSearch"] : null,
	};
}

export interface DiagramInfoResponse {
	diagramId: string | null;
	name: string | null;
	description: string | null;
	workGroupIds: string[] | null;
}

/**
 * `RequestDiagramInfo` への応答内容を決める。応答すべきでないときは null
 * (ReferenceServer 準拠で TRViS は無応答を許容する)。
 *
 * - ダイヤ情報が一切未設定 → null
 * - `requestedDiagramId` 指定があり、設定済み `DiagramId` と不一致 → null
 * - `requestedDiagramId` 省略 (= カレント要求) → 設定済みダイヤを返す
 */
export function decideDiagramInfoResponse(
	info: EditorDiagramInfo,
	requestedDiagramId: string | null,
): DiagramInfoResponse | null {
	const configuredId = trimOrNull(info.DiagramId);
	const name = trimOrNull(info.Name);
	const description = trimOrNull(info.Description);
	const workGroupIds = info.WorkGroupIds.map((s) => s.trim()).filter((s) => s !== "");

	if (!configuredId && !name && !description && workGroupIds.length === 0) return null;
	if (requestedDiagramId != null && requestedDiagramId !== configuredId) return null;

	return {
		diagramId: configuredId,
		name,
		description,
		workGroupIds: workGroupIds.length > 0 ? workGroupIds : null,
	};
}
