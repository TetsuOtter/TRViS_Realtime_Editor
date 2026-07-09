/**
 * Tauri 側 WebSocket サーバとの IPC ブリッジ。
 *
 * Tauri が無い環境(普通のブラウザ・vitest 等) でも動くように `mockMode` を持つ。
 */

import type {
	OperationCommandAction,
	ServerTimetableMessage,
	WorkGroupData,
	WorkData,
	TrainData,
	TrainSearchResultSummary,
	WsMonitorEvent,
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

/**
 * 指定クライアントだけに `Scope.All` の Timetable を送る。
 * 新規接続クライアントへの初期配信に使う (既存クライアントの選択・位置情報を巻き戻さない)。
 * 送信先がすでに切断されていた場合は false。
 */
export async function sendInitialTimetableTo(
	clientId: string,
	workGroups: WorkGroupData[],
): Promise<boolean> {
	const t = await loadTauri();
	if (!t) return false;
	return t.invoke<boolean>("send_initial_timetable_to", {
		clientId,
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

/**
 * TRViS で表示中の列車を切り替える指示を送る (`SelectTrain` メッセージ)。
 * いずれかのフィールドが省略されている階層は TRViS 側のデフォルトに従う想定。
 */
export async function broadcastSelectTrain(args: {
	workGroupId?: string | null;
	workId?: string | null;
	trainId?: string | null;
}): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_select_train", {
		workGroupId: args.workGroupId ?? null,
		workId: args.workId ?? null,
		trainId: args.trainId ?? null,
	});
}

/** 運行操作コマンド (運行開始 / 終了 / 位置情報サービスの ON / OFF) を送る。 */
export async function broadcastOperationCommand(action: OperationCommandAction): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_operation_command", { action });
}

/**
 * タイトルバー色変更要求を送る。
 * `colorRgb` は 0xRRGGBB の整数 (例: `0x336699`)。`resetToDefault: true` のときは無視される。
 */
export async function broadcastHeaderColor(args: {
	resetToDefault: boolean;
	colorRgb?: number | null;
}): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_header_color", {
		resetToDefault: args.resetToDefault,
		colorRgb: args.resetToDefault ? null : (args.colorRgb ?? null),
	});
}

/**
 * 通告 (任意のお知らせ) を送る。
 * `id` を指定すると TRViS 側で「受領可能」な通告になり、受領時に
 * `AcknowledgeNotification` が送り返される。省略時は情報通知 (閉じるだけ)。
 */
export async function broadcastNotification(args: {
	id?: string | null;
	/** 指令番号。表示のみに用いられる。 */
	orderNumber?: string | null;
	title?: string | null;
	body?: string | null;
	priority?: number | null;
	/** ISO8601 文字列 */
	issuedAt?: string | null;
	/** 受信者。表示のみに用いられる。 */
	receiver?: string | null;
	/** 指令者 (発信者)。表示のみに用いられる。 */
	sender?: string | null;
	/** アイコン文字 (1〜2文字程度)。iconImageBase64 指定時は無視される。 */
	iconText?: string | null;
	/** iconText の背景色 (0xRRGGBB の整数)。未指定時は既定色。 */
	iconColorRgb?: number | null;
	/** アイコン画像の Base64 (data URI プレフィックス可)。指定時は iconText/iconColorRgb より優先。 */
	iconImageBase64?: string | null;
	/** サーバ再配信時に既読扱いにするケース用。通常送信は false (省略)。 */
	acknowledged?: boolean | null;
	/** true で初回表示を画面上部の小型バナーにする。未指定/false は大型の中央ポップアップ。 */
	compactDisplay?: boolean | null;
	/** 区間・駅連動の再表示: 開始側 (駅名または駅ID)。 */
	sectionStartStation?: string | null;
	/** 区間・駅連動の再表示: 終了側 (駅名または駅ID)。未指定時は開始側と同一 (単駅) 扱い。 */
	sectionEndStation?: string | null;
	/** 区間開始の何駅手前から再表示を開始するか。未指定時は 1。 */
	stationsBefore?: number | null;
}): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_notification", {
		id: args.id ?? null,
		orderNumber: args.orderNumber ?? null,
		title: args.title ?? null,
		body: args.body ?? null,
		priority: args.priority ?? null,
		issuedAt: args.issuedAt ?? null,
		receiver: args.receiver ?? null,
		sender: args.sender ?? null,
		iconText: args.iconText ?? null,
		iconColorRgb: args.iconColorRgb ?? null,
		iconImageBase64: args.iconImageBase64 ?? null,
		acknowledged: args.acknowledged ?? false,
		compactDisplay: args.compactDisplay ?? false,
		sectionStartStation: args.sectionStartStation ?? null,
		sectionEndStation: args.sectionEndStation ?? null,
		stationsBefore: args.stationsBefore ?? null,
	});
}

/** タイトルバーの時刻表示フォーマットを変更する。`format` を null/省略すると端末既定にリセット。 */
export async function broadcastTimeFormat(format?: string | null): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_time_format", { format: format ?? null });
}

/** ServerInfo を全クライアントへ proactive に配信する。 */
export async function broadcastServerInfo(args: {
	name?: string | null;
	admin?: string | null;
	version?: string | null;
	protocolVersion?: string | null;
	features?: string[] | null;
}): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_server_info", {
		name: args.name ?? null,
		admin: args.admin ?? null,
		version: args.version ?? null,
		protocolVersion: args.protocolVersion ?? null,
		features: args.features ?? null,
	});
}

/**
 * 特定のクライアントだけに `ServerInfo` を返信する (`RequestServerInfo` への応答)。
 * 戻り値は送信先クライアントがまだ接続されていれば true。
 */
export async function respondServerInfo(args: {
	clientId: string;
	name?: string | null;
	admin?: string | null;
	version?: string | null;
	protocolVersion?: string | null;
	features?: string[] | null;
}): Promise<boolean> {
	const t = await loadTauri();
	if (!t) return false;
	return t.invoke<boolean>("respond_server_info", {
		clientId: args.clientId,
		name: args.name ?? null,
		admin: args.admin ?? null,
		version: args.version ?? null,
		protocolVersion: args.protocolVersion ?? null,
		features: args.features ?? null,
	});
}

/** DiagramInfo を全クライアントへ配信する。 */
export async function broadcastDiagramInfo(args: {
	diagramId?: string | null;
	name?: string | null;
	description?: string | null;
	workGroupIds?: string[] | null;
}): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("broadcast_diagram_info", {
		diagramId: args.diagramId ?? null,
		name: args.name ?? null,
		description: args.description ?? null,
		workGroupIds: args.workGroupIds ?? null,
	});
}

/**
 * 特定のクライアントだけに `DiagramInfo` を返信する (`RequestDiagramInfo` への応答)。
 * 戻り値は送信先クライアントがまだ接続されていれば true。
 */
export async function respondDiagramInfo(args: {
	clientId: string;
	diagramId?: string | null;
	name?: string | null;
	description?: string | null;
	workGroupIds?: string[] | null;
}): Promise<boolean> {
	const t = await loadTauri();
	if (!t) return false;
	return t.invoke<boolean>("respond_diagram_info", {
		clientId: args.clientId,
		diagramId: args.diagramId ?? null,
		name: args.name ?? null,
		description: args.description ?? null,
		workGroupIds: args.workGroupIds ?? null,
	});
}

/**
 * 特定のクライアントだけに `SearchTrainResponse` を返信する (`SearchTrain` への応答, v1.1)。
 * `results` が空でも必ず送ること (「該当なし」と「無応答/タイムアウト」をクライアントが区別するため)。
 * 戻り値は送信先クライアントがまだ接続されていれば true。
 */
export async function respondSearchTrain(args: {
	clientId: string;
	requestId: string;
	results: TrainSearchResultSummary[];
}): Promise<boolean> {
	const t = await loadTauri();
	if (!t) return false;
	return t.invoke<boolean>("respond_search_train", {
		clientId: args.clientId,
		requestId: args.requestId,
		results: args.results,
	});
}

/**
 * 特定のクライアントだけに Train スコープの `Timetable` を送る (`RequestTrainTimetable` への応答, v1.1)。
 * `broadcastTrain`/`sendInitialTimetableTo` と異なり、他クライアントへは影響させず、
 * 新規接続時の initial キャッシュも更新しない (検索結果はその場限りの表示のため)。
 * 戻り値は送信先クライアントがまだ接続されていれば true。
 */
export async function sendTrainTimetableTo(args: {
	clientId: string;
	workGroupId: string;
	workId: string;
	train: TrainData;
}): Promise<boolean> {
	const t = await loadTauri();
	if (!t) return false;
	if (!args.train.Id) throw new Error("Train に Id が必要");
	return t.invoke<boolean>("send_train_timetable_to", {
		clientId: args.clientId,
		workGroupId: args.workGroupId,
		workId: args.workId,
		trainId: args.train.Id,
		data: args.train,
	});
}

export async function setSyncedData(args: {
	locationM: number | null;
	timeMs: number;
	canStart: boolean;
	/**
	 * `true` の場合、サーバが各クライアントへの再送タイミング (~250ms) で
	 * `Time_ms` を wall-clock 由来で都度上書きする。受信側で同じ秒が止まって
	 * 突然ジャンプする現象を避けるための flag。`timeMs` は無視されるが、
	 * Tauri 側で型を揃えるためそのまま渡す。
	 */
	autoTimeMs: boolean;
}): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("set_synced_data", {
		locationM: args.locationM,
		timeMs: args.timeMs,
		canStart: args.canStart,
		autoTimeMs: args.autoTimeMs,
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

/** Tauri の `ws-monitor` (通信モニタフレーム) を購読。 unsubscribe を返す。 */
export async function subscribeWsMonitor(
	handler: (event: WsMonitorEvent) => void,
): Promise<() => void> {
	const t = await loadTauri();
	if (!t) return () => {};
	return t.listen<WsMonitorEvent>("ws-monitor", (e) => handler(e.payload));
}

/**
 * 通信モニタの有効/無効を切り替える。
 * 無効時は Rust 側でワイヤ JSON の観測フレームを一切発火しない
 * (モニタを閉じている間の余計な IPC を防ぐ)。
 */
export async function setMonitorEnabled(enabled: boolean): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("set_monitor_enabled", { enabled });
}

/**
 * デバッグ用: 任意のテキストを一切加工せず送信する。
 * `clientId` 省略時は全クライアントへブロードキャスト。
 * 戻り値 false = 指定クライアントが既に切断済み。
 * JSON 妥当性検証はしない (呼び出し側で必要なら警告する)。
 */
export async function sendRawMessage(text: string, clientId?: string): Promise<boolean> {
	const t = await loadTauri();
	if (!t) return false;
	return t.invoke<boolean>("send_raw_message", {
		clientId: clientId ?? null,
		text,
	});
}

/** 通信モニタを別ウィンドウで開く (既に開いていればフォーカス)。 */
export async function openMonitorWindow(): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("open_monitor_window");
}

/**
 * 別ウィンドウのモニタをアプリ内ドックへ戻す。
 * メインウィンドウへ位置を通知し、モニタウィンドウを閉じる。
 */
export async function redockMonitor(position: "right" | "bottom" | "left"): Promise<void> {
	const t = await loadTauri();
	if (!t) return;
	await t.invoke<void>("redock_monitor", { position });
}

/** メインウィンドウ側: 別ウィンドウからの「アプリ内へ戻す」要求を購読。 */
export async function subscribeMonitorRedock(
	handler: (position: "right" | "bottom" | "left") => void,
): Promise<() => void> {
	const t = await loadTauri();
	if (!t) return () => {};
	return t.listen<"right" | "bottom" | "left">("monitor-redock", (e) => handler(e.payload));
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
