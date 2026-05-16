import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	useMonitorStore,
	SYNCED_MESSAGE_TYPE,
	type DockPosition,
	type MonitorEntry,
} from "../../store/monitorStore";
import { MonitorFrameRow } from "./MonitorFrameRow";
import { MonitorComposer } from "./MonitorComposer";

interface Props {
	/** "docked" = アプリ内ドック、 "window" = 別ウィンドウ単独表示 */
	variant: "docked" | "window";
	/** ドック時の閉じる動作 */
	onClose?: () => void;
	/** 別ウィンドウを開く (docked のみ) */
	onOpenWindow?: () => void;
	/** 別ウィンドウからアプリ内ドックへ戻す (window のみ) */
	onRedock?: (position: Exclude<DockPosition, "window">) => void;
}

const DOCK_LABELS: Array<{ value: DockPosition; label: string; title: string }> = [
	{ value: "left", label: "⊣", title: "左にドック" },
	{ value: "bottom", label: "⊥", title: "下にドック" },
	{ value: "right", label: "⊢", title: "右にドック" },
	{ value: "window", label: "❒", title: "別ウィンドウで開く" },
];

export function MonitorPanel({ variant, onClose, onOpenWindow, onRedock }: Props) {
	const entries = useMonitorStore((s) => s.entries);
	const syncedEntries = useMonitorStore((s) => s.syncedEntries);
	const paused = useMonitorStore((s) => s.paused);
	const search = useMonitorStore((s) => s.search);
	const settings = useMonitorStore((s) => s.settings);
	const setPaused = useMonitorStore((s) => s.setPaused);
	const setSearch = useMonitorStore((s) => s.setSearch);
	const clear = useMonitorStore((s) => s.clear);
	const setDock = useMonitorStore((s) => s.setDock);
	const setKeepFullBodies = useMonitorStore((s) => s.setKeepFullBodies);
	const setShowSyncedData = useMonitorStore((s) => s.setShowSyncedData);
	const setMaxEntries = useMonitorStore((s) => s.setMaxEntries);
	const toggleHiddenType = useMonitorStore((s) => s.toggleHiddenType);

	const [showSettings, setShowSettings] = useState(false);

	// 表示対象 = メインバッファ + (表示 ON のとき) SyncedData バッファ。
	// id は両バッファ通して単調増加なので、それでソートすれば時系列順に戻る。
	const visibleEntries = useMemo(() => {
		if (!settings.showSyncedData) return entries;
		return [...entries, ...syncedEntries].sort((a, b) => a.id - b.id);
	}, [entries, syncedEntries, settings.showSyncedData]);

	// 観測済みの種別とクライアントを集計 (フィルタチップ / 送信先候補用)。
	// SyncedData は専用トグルで扱うのでチップには出さない (entries に入らない)。
	const { typeCounts, knownClients } = useMemo(() => {
		const tc = new Map<string, number>();
		const clients = new Set<string>();
		for (const e of entries) {
			tc.set(e.messageType, (tc.get(e.messageType) ?? 0) + 1);
			if (e.clientId) clients.add(e.clientId);
		}
		for (const e of syncedEntries) if (e.clientId) clients.add(e.clientId);
		return {
			typeCounts: [...tc.entries()].sort((a, b) => a[0].localeCompare(b[0])),
			knownClients: [...clients],
		};
	}, [entries, syncedEntries]);

	const hiddenSet = useMemo(() => new Set(settings.hiddenTypes), [settings.hiddenTypes]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return visibleEntries.filter((e: MonitorEntry) => {
			// SyncedData の表示可否は showSyncedData 単独で司る (visibleEntries で制御済み)。
			// hiddenSet 判定対象から外すことで、旧 localStorage に残った
			// hiddenTypes:["SyncedData"] でトグルが無効化される事故を防ぐ。
			if (
				e.direction !== "system" &&
				e.messageType !== SYNCED_MESSAGE_TYPE &&
				hiddenSet.has(e.messageType)
			) {
				return false;
			}
			if (!q) return true;
			return (
				e.body.toLowerCase().includes(q) ||
				e.messageType.toLowerCase().includes(q) ||
				e.clientId.toLowerCase().includes(q)
			);
		});
	}, [visibleEntries, search, hiddenSet]);

	// 末尾追従スクロール: ユーザが下端付近にいるときだけ自動で最下部へ。
	const listRef = useRef<HTMLDivElement | null>(null);
	const stickRef = useRef(true);
	const onScroll = () => {
		const el = listRef.current;
		if (!el) return;
		stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
	};
	useLayoutEffect(() => {
		const el = listRef.current;
		if (el && stickRef.current) el.scrollTop = el.scrollHeight;
	}, [filtered]);

	// 別ウィンドウのときはタブ/ウィンドウタイトルを変える。
	useEffect(() => {
		if (variant === "window") document.title = "通信モニタ - TRViS Realtime Editor";
	}, [variant]);

	const iconBtn: React.CSSProperties = {
		padding: "2px 8px",
		border: "1px solid var(--border)",
		borderRadius: 6,
		background: "var(--bg-panel)",
		fontSize: 12,
	};

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				minHeight: 0,
				background: "var(--bg)",
			}}
		>
			{/* ヘッダ */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "6px 8px",
					borderBottom: "1px solid var(--border)",
					background: "var(--bg-panel)",
					flexWrap: "wrap",
				}}
			>
				<strong style={{ fontSize: 13 }}>通信モニタ</strong>

				<button
					type="button"
					onClick={() => setPaused(!paused)}
					style={{
						...iconBtn,
						background: paused ? "var(--danger)" : "var(--bg-panel)",
						color: paused ? "#fff" : "var(--text)",
						border: paused ? "1px solid var(--danger)" : "1px solid var(--border)",
					}}
					title={paused ? "記録を再開" : "記録を一時停止"}
				>
					{paused ? "▶ 再開" : "⏸ 一時停止"}
				</button>
				<button type="button" onClick={clear} style={iconBtn} title="表示中のログを消去">
					🗑 消去
				</button>
				<button
					type="button"
					onClick={() => setShowSettings((v) => !v)}
					style={iconBtn}
					title="設定"
				>
					⚙ 設定
				</button>

				<div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
					{DOCK_LABELS.map((d) => {
						const active = settings.dock === d.value;
						if (d.value === "window") {
							return (
								<button
									key={d.value}
									type="button"
									onClick={() => onOpenWindow?.()}
									style={iconBtn}
									title={d.title}
									disabled={variant === "window"}
								>
									{d.label}
								</button>
							);
						}
						const pos = d.value as Exclude<DockPosition, "window">;
						return (
							<button
								key={d.value}
								type="button"
								onClick={() => (variant === "window" ? onRedock?.(pos) : setDock(pos))}
								style={{
									...iconBtn,
									background: active && variant === "docked" ? "var(--accent)" : "var(--bg-panel)",
									color: active && variant === "docked" ? "#fff" : "var(--text)",
								}}
								title={variant === "window" ? `${d.title} (ウィンドウを閉じて戻す)` : d.title}
							>
								{d.label}
							</button>
						);
					})}
					{variant === "docked" && (
						<button type="button" onClick={onClose} style={iconBtn} title="モニタを閉じる">
							✕
						</button>
					)}
				</div>
			</div>

			{showSettings && (
				<div
					style={{
						padding: "8px",
						borderBottom: "1px solid var(--border)",
						background: "var(--bg-panel)",
						display: "flex",
						gap: 16,
						alignItems: "center",
						flexWrap: "wrap",
						fontSize: 12,
					}}
				>
					<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<input
							type="checkbox"
							checked={settings.keepFullBodies}
							onChange={(e) => setKeepFullBodies(e.target.checked)}
							style={{ accentColor: "var(--accent)" }}
						/>
						本文を切り詰めない (大きい Timetable はメモリ増大に注意)
					</label>
					<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
						保持件数
						<input
							type="number"
							min={10}
							max={5000}
							value={settings.maxEntries}
							onChange={(e) => setMaxEntries(Number(e.target.value))}
							style={{
								width: 72,
								padding: "2px 4px",
								border: "1px solid var(--border)",
								borderRadius: 4,
							}}
						/>
					</label>
				</div>
			)}

			{/* 検索 + 種別フィルタ */}
			<div
				style={{
					padding: "6px 8px",
					borderBottom: "1px solid var(--border)",
					background: "var(--bg-panel)",
					display: "flex",
					flexDirection: "column",
					gap: 6,
				}}
			>
				<input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="本文 / 種別 / クライアントIDを検索"
					style={{
						padding: "4px 8px",
						border: "1px solid var(--border)",
						borderRadius: 6,
						background: "var(--bg)",
						fontSize: 12,
					}}
				/>
				{/* SyncedData は専用バッファ管理。表示有無のトグルは常に出す。 */}
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						fontSize: 12,
						color: "var(--text)",
					}}
					title="SyncedData は別バッファに隔離して溜めています (250ms × 接続数 で高頻度)。ここで一覧表示の有無を切り替えます。"
				>
					<input
						type="checkbox"
						checked={settings.showSyncedData}
						onChange={(e) => setShowSyncedData(e.target.checked)}
						style={{ accentColor: "var(--accent)" }}
					/>
					SyncedData を表示
					<span style={{ color: "var(--text-muted)" }}>(バッファ {syncedEntries.length} 件)</span>
				</label>

				<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
					{typeCounts.length === 0 && (
						<span style={{ fontSize: 11, color: "var(--text-muted)" }}>
							SyncedData 以外の通信はまだありません
						</span>
					)}
					{typeCounts.map(([type, count]) => {
						const hidden = hiddenSet.has(type);
						return (
							<button
								key={type}
								type="button"
								onClick={() => toggleHiddenType(type)}
								style={{
									padding: "2px 8px",
									border: "1px solid var(--border)",
									borderRadius: 999,
									fontSize: 11,
									background: hidden ? "var(--bg)" : "var(--accent)",
									color: hidden ? "var(--text-muted)" : "#fff",
									textDecoration: hidden ? "line-through" : "none",
								}}
								title={hidden ? "クリックで表示" : "クリックで非表示"}
							>
								{type} ({count})
							</button>
						);
					})}
				</div>
			</div>

			{/* フレーム一覧 */}
			<div ref={listRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
				{filtered.length === 0 ? (
					<div
						style={{
							padding: 24,
							textAlign: "center",
							color: "var(--text-muted)",
							fontSize: 13,
						}}
					>
						{entries.length === 0 && syncedEntries.length === 0 ? (
							"サーバを起動して TRViS と通信すると、ここに送受信内容が表示されます"
						) : (
							<>
								フィルタ条件に一致する通信がありません
								{!settings.showSyncedData && syncedEntries.length > 0 && (
									<div style={{ marginTop: 6, fontSize: 12 }}>
										SyncedData を {syncedEntries.length} 件受信中です。上の「SyncedData を表示」を
										ON にすると表示されます。
									</div>
								)}
								{hiddenSet.size > 0 && (
									<div style={{ marginTop: 6, fontSize: 12 }}>
										非表示中の種別: {[...hiddenSet].join(", ")}
										<br />
										上のチップをクリックすると表示できます。
									</div>
								)}
							</>
						)}
					</div>
				) : (
					filtered.map((e) => <MonitorFrameRow key={e.id} entry={e} />)
				)}
			</div>

			<MonitorComposer knownClients={knownClients} />
		</div>
	);
}
