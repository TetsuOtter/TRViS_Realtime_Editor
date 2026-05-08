/**
 * Tauri 側 WebSocket サーバとの IPC ブリッジ。
 *
 * Tauri が無い環境(普通のブラウザ・vitest 等) でも動くように `mockMode` を持つ。
 */

import type {
	ServerTimetableMessage,
	WorkGroupData,
	WorkData,
	TrainData,
	WsServerEvent,
} from "../types/trvis";

type InvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type ListenFn = <T = unknown>(
	event: string,
	handler: (event: { payload: T }) => void,
) => Promise<() => void>;

interface TauriBridge {
	invoke: InvokeFn;
	listen: ListenFn;
}

let cached: TauriBridge | null | undefined; // undefined = unresolved
async function loadTauri(): Promise<TauriBridge | null> {
	if (cached !== undefined) return cached;
	if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
		cached = null;
		return null;
	}
	const core = await import("@tauri-apps/api/core");
	const event = await import("@tauri-apps/api/event");
	cached = {
		invoke: core.invoke as InvokeFn,
		listen: event.listen as ListenFn,
	};
	return cached;
}

export interface StartResult {
	port: number;
	hosts: string[];
}

export async function startServer(opts?: { host?: string; port?: number }): Promise<StartResult> {
	const t = await loadTauri();
	if (!t) throw new Error("Tauri 環境ではないため WebSocket サーバを起動できません");
	return t.invoke<StartResult>("start_server", {
		host: opts?.host,
		port: opts?.port,
	});
}

export async function stopServer(): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("stop_server");
}

export async function listLocalHosts(): Promise<string[]> {
	const t = await loadTauri();
	if (!t) return ["127.0.0.1"];
	return t.invoke<string[]>("list_local_hosts");
}

/** すべての WorkGroup を `Scope.All` でブロードキャスト送信。 */
export async function broadcastAllWorkGroups(workGroups: WorkGroupData[]): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_timetable", {
		workGroupId: null,
		workId: null,
		trainId: null,
		data: workGroups,
	});
}

/** 単一 WorkGroup を `Scope.WorkGroup` で送信。 */
export async function broadcastWorkGroup(workGroup: WorkGroupData): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	if (!workGroup.Id) throw new Error("WorkGroup に Id が必要");
	await t.invoke<void>("broadcast_timetable", {
		workGroupId: workGroup.Id,
		workId: null,
		trainId: null,
		data: workGroup,
	});
}

/** 単一 Work を `Scope.Work` で送信。 */
export async function broadcastWork(workGroupId: string, work: WorkData): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	if (!work.Id) throw new Error("Work に Id が必要");
	await t.invoke<void>("broadcast_timetable", {
		workGroupId,
		workId: work.Id,
		trainId: null,
		data: work,
	});
}

/** 単一 Train を `Scope.Train` で送信。 */
export async function broadcastTrain(
	workGroupId: string,
	workId: string,
	train: TrainData,
): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	if (!train.Id) throw new Error("Train に Id が必要");
	await t.invoke<void>("broadcast_timetable", {
		workGroupId,
		workId,
		trainId: train.Id,
		data: train,
	});
}

export async function setSyncedData(args: {
	locationM: number | null;
	timeMs: number;
	canStart: boolean;
}): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("set_synced_data", {
		locationM: args.locationM,
		timeMs: args.timeMs,
		canStart: args.canStart,
	});
}

/** Tauri の `ws-event` を購読。 unsubscribe を返す。 */
export async function subscribeWsEvents(
	handler: (event: WsServerEvent) => void,
): Promise<() => void> {
	const t = await loadTauri();
	if (!t) return () => {};
	return t.listen<WsServerEvent>("ws-event", (e) => handler(e.payload));
}

/** TRViSのカスタムスキームURL生成 (TRViS.LocalServers ConnectHelperと同じ書式)。 */
export function getTrvisAppLinkWs(host: string, port: number): string {
	return `trvis://app/open/json?path=ws://${host}:${port}/ws`;
}

/** for test/debug only: 参考用 ScopeAll Timetable を組み立てる(送信しない) */
export function buildScopeAllTimetable(workGroups: WorkGroupData[]): ServerTimetableMessage {
	return {
		MessageType: "Timetable",
		Data: workGroups,
	};
}
