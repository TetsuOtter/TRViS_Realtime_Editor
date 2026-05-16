/**
 * 通信モニタ用のクライアント側ストア。
 *
 * Rust 側 (`ws-monitor`) から流れてくる生フレームをリングバッファに溜め、
 * 検索 / タイプ別フィルタ / 手動送信設定を保持する。
 *
 * バッファ分離:
 *   - `entries`        … SyncedData 以外。既定 200 件。
 *   - `syncedEntries`  … SyncedData 専用。250ms × 接続数 で高頻度に流れ、
 *     そのままだとメイン用バッファを即座に食い尽くすため別バッファに隔離する。
 *
 * メモリ保護:
 *   - 各バッファに件数上限
 *   - 1 エントリの本文上限 (既定 64KiB 相当の文字数)。超過分は切り詰めて
 *     `truncated` を立てる。`keepFullBodies` を有効にすると切り詰めない。
 *
 * パフォーマンス: Timetable は巨大になり得るので immer は使わず、
 * 配列を明示的に差し替える。
 */

import { create } from "zustand";
import type { MonitorFrame } from "../types/trvis";

export type DockPosition = "right" | "bottom" | "left" | "window";
export type SendOnKey = "enter" | "mod-enter";
export type FrameDirection = "in" | "out" | "system";

export const SYNCED_MESSAGE_TYPE = "SyncedData";

export interface MonitorEntry {
	id: number;
	direction: FrameDirection;
	clientId: string;
	/** UNIX epoch ミリ秒 */
	ts: number;
	/** 表示用本文 (切り詰められている場合あり) */
	body: string;
	truncated: boolean;
	/** 切り詰め前の文字数 */
	originalLength: number;
	/** 派生したメッセージ種別 (フィルタ用) */
	messageType: string;
}

export interface MonitorSettings {
	dock: DockPosition;
	sendOnKey: SendOnKey;
	keepFullBodies: boolean;
	maxEntries: number;
	/** SyncedData を一覧に表示するか (専用バッファは表示有無に関わらず常に溜める) */
	showSyncedData: boolean;
	/** ドック時のパネルサイズ (右/左 = 幅 px、下 = 高さ px) */
	panelSize: number;
	/** 非表示にするメッセージ種別 (SyncedData は showSyncedData で別管理) */
	hiddenTypes: string[];
}

const DEFAULT_MAX_BODY_CHARS = 64 * 1024;
/** SyncedData 専用バッファの上限。繰り返し内容なので浅めで十分。 */
const SYNCED_MAX_ENTRIES = 120;
const SETTINGS_KEY = "trvis-monitor-settings";

const DEFAULT_SETTINGS: MonitorSettings = {
	dock: "right",
	sendOnKey: "mod-enter",
	keepFullBodies: false,
	maxEntries: 200,
	// 既定で SyncedData は非表示 (250ms × 接続数 で流れ、他のイベントが埋もれるため)。
	// ただしバッファには溜め続けるので、トグルを入れれば直近の履歴が見える。
	showSyncedData: false,
	panelSize: 420,
	hiddenTypes: [],
};

/**
 * 永続化された hiddenTypes から "SyncedData" を除去する移行処理。
 * 旧バージョンは SyncedData を hiddenTypes で隠していたが、現在は showSyncedData が
 * 単独で司る。両者が衝突すると「トグル ON でも出ない」旧環境の地雷になるため除く。
 */
export function sanitizeHiddenTypes(types: readonly string[]): string[] {
	return types.filter((t) => t !== SYNCED_MESSAGE_TYPE);
}

function loadSettings(): MonitorSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<MonitorSettings>;
		const merged = { ...DEFAULT_SETTINGS, ...parsed };
		merged.hiddenTypes = sanitizeHiddenTypes(merged.hiddenTypes);
		return merged;
	} catch {
		return DEFAULT_SETTINGS;
	}
}

function persistSettings(s: MonitorSettings) {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
	} catch {
		/* localStorage 不可環境 (一部 webview) では黙って無視 */
	}
}

/**
 * 生 JSON 文字列からフィルタ用のメッセージ種別を導出する。
 *   - `MessageType` フィールドがあればその値
 *   - 無く WorkGroupId/WorkId/TrainId のいずれかがあれば `IdUpdate`
 *     (TRViS 本体の ID 更新メッセージは MessageType を持たない)
 *   - JSON として解釈できなければ `Invalid`
 *   - それ以外は `Unknown`
 */
export function deriveMessageType(raw: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return "Invalid";
	}
	if (parsed && typeof parsed === "object") {
		const obj = parsed as Record<string, unknown>;
		const mt = obj.MessageType;
		if (typeof mt === "string" && mt.length > 0) return mt;
		if ("WorkGroupId" in obj || "WorkId" in obj || "TrainId" in obj) return "IdUpdate";
	}
	return "Unknown";
}

let nextId = 1;

interface MonitorState {
	entries: MonitorEntry[];
	/** SyncedData 専用バッファ (メインバッファとは独立) */
	syncedEntries: MonitorEntry[];
	paused: boolean;
	search: string;
	/** ドックパネルの表示状態 (永続化しない) */
	open: boolean;
	settings: MonitorSettings;

	pushFrame(frame: MonitorFrame): void;
	pushSystem(text: string): void;
	clear(): void;
	setPaused(v: boolean): void;
	setSearch(s: string): void;
	setOpen(v: boolean): void;
	setDock(d: DockPosition): void;
	setSendOnKey(k: SendOnKey): void;
	setKeepFullBodies(v: boolean): void;
	setShowSyncedData(v: boolean): void;
	setMaxEntries(n: number): void;
	setPanelSize(n: number): void;
	toggleHiddenType(t: string): void;
}

function ringPush(buf: MonitorEntry[], entry: MonitorEntry, max: number): MonitorEntry[] {
	const cap = Math.max(1, max);
	const next = buf.concat(entry);
	return next.length > cap ? next.slice(next.length - cap) : next;
}

export const useMonitorStore = create<MonitorState>((set) => ({
	entries: [],
	syncedEntries: [],
	paused: false,
	search: "",
	open: false,
	settings: loadSettings(),

	pushFrame: (frame) =>
		set((state) => {
			if (state.paused) return state;
			const messageType = deriveMessageType(frame.json);
			const max = state.settings.keepFullBodies ? Infinity : DEFAULT_MAX_BODY_CHARS;
			const truncated = frame.json.length > max;
			const entry: MonitorEntry = {
				id: nextId++,
				direction: frame.direction,
				clientId: frame.clientId,
				ts: frame.ts,
				body: truncated ? frame.json.slice(0, max) : frame.json,
				truncated,
				originalLength: frame.json.length,
				messageType,
			};
			// SyncedData は専用バッファへ隔離してメインバッファを保護する。
			if (messageType === SYNCED_MESSAGE_TYPE) {
				return { syncedEntries: ringPush(state.syncedEntries, entry, SYNCED_MAX_ENTRIES) };
			}
			return { entries: ringPush(state.entries, entry, state.settings.maxEntries) };
		}),

	pushSystem: (text) =>
		set((state) => {
			const entry: MonitorEntry = {
				id: nextId++,
				direction: "system",
				clientId: "",
				ts: Date.now(),
				body: text,
				truncated: false,
				originalLength: text.length,
				messageType: "System",
			};
			return { entries: ringPush(state.entries, entry, state.settings.maxEntries) };
		}),

	clear: () => set({ entries: [], syncedEntries: [] }),
	setPaused: (v) => set({ paused: v }),
	setSearch: (s) => set({ search: s }),
	setOpen: (v) => set({ open: v }),

	setDock: (dock) =>
		set((state) => {
			const settings = { ...state.settings, dock };
			persistSettings(settings);
			return { settings };
		}),

	setSendOnKey: (sendOnKey) =>
		set((state) => {
			const settings = { ...state.settings, sendOnKey };
			persistSettings(settings);
			return { settings };
		}),

	setKeepFullBodies: (keepFullBodies) =>
		set((state) => {
			const settings = { ...state.settings, keepFullBodies };
			persistSettings(settings);
			return { settings };
		}),

	setShowSyncedData: (showSyncedData) =>
		set((state) => {
			const settings = { ...state.settings, showSyncedData };
			persistSettings(settings);
			return { settings };
		}),

	setMaxEntries: (maxEntries) =>
		set((state) => {
			const clamped = Math.max(10, Math.min(5000, Math.floor(maxEntries) || 200));
			const settings = { ...state.settings, maxEntries: clamped };
			persistSettings(settings);
			const entries =
				state.entries.length > clamped
					? state.entries.slice(state.entries.length - clamped)
					: state.entries;
			return { settings, entries };
		}),

	setPanelSize: (panelSize) =>
		set((state) => {
			const clamped = Math.max(220, Math.min(1400, Math.round(panelSize)));
			const settings = { ...state.settings, panelSize: clamped };
			persistSettings(settings);
			return { settings };
		}),

	toggleHiddenType: (t) =>
		set((state) => {
			const has = state.settings.hiddenTypes.includes(t);
			const hiddenTypes = has
				? state.settings.hiddenTypes.filter((x) => x !== t)
				: [...state.settings.hiddenTypes, t];
			const settings = { ...state.settings, hiddenTypes };
			persistSettings(settings);
			return { settings };
		}),
}));
