import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { setSyncedData as apiSetSyncedData } from "../api/wsServer";

const BROADCAST_INTERVAL_MS = 1000;

/** ローカル時刻の 0時からの経過 ms。TRViS の `Time_ms` 規約に従う。 */
function localMillisOfDay(): number {
	const d = new Date();
	return (
		d.getHours() * 3_600_000 + d.getMinutes() * 60_000 + d.getSeconds() * 1000 + d.getMilliseconds()
	);
}

interface Props {
	compact?: boolean;
}

export function SyncedDataPanel({ compact = false }: Props = {}) {
	const { syncedData, autoTimeMs, setSyncedData, setAutoTimeMs } = useEditorStore();
	const [broadcasting, setBroadcasting] = useState(false);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const broadcast = async () => {
		// auto モードのときはサーバ側で wall-clock 由来の Time_ms を再計算するので、
		// ここで渡す値は無視される (Tauri の型を満たすために 0 を渡しておく)。
		const timeMs = autoTimeMs ? 0 : (syncedData.Time_ms ?? 0);
		try {
			await apiSetSyncedData({
				locationM: syncedData.Location_m,
				timeMs,
				canStart: syncedData.CanStart ?? false,
				autoTimeMs,
			});
		} catch {
			// Tauri環境でなければ何もしない
		}
	};

	/**
	 * 配信停止時、サーバの再送タイマが auto_time_ms=true のキャッシュを参照し続けて
	 * 「停止後も時刻が進み続ける」状態にならないよう、停止直前のローカル時刻を
	 * `auto_time_ms=false` で書き戻し、サーバ側の再送値を凍結する。
	 */
	const freezeBroadcast = async () => {
		const timeMs = autoTimeMs ? localMillisOfDay() : (syncedData.Time_ms ?? 0);
		try {
			await apiSetSyncedData({
				locationM: syncedData.Location_m,
				timeMs,
				canStart: syncedData.CanStart ?? false,
				autoTimeMs: false,
			});
		} catch {
			// Tauri環境でなければ何もしない
		}
	};

	const toggleBroadcasting = () => {
		if (broadcasting) {
			void freezeBroadcast();
			setBroadcasting(false);
		} else {
			setBroadcasting(true);
		}
	};

	useEffect(() => {
		if (broadcasting) {
			timerRef.current = setInterval(broadcast, BROADCAST_INTERVAL_MS);
		} else {
			if (timerRef.current) clearInterval(timerRef.current);
		}
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, [broadcasting, syncedData, autoTimeMs]); // eslint-disable-line react-hooks/exhaustive-deps

	const inputStyle: React.CSSProperties = {
		padding: compact ? "2px 6px" : "4px 8px",
		border: "1px solid var(--border)",
		borderRadius: 4,
		background: "var(--bg)",
		fontSize: compact ? 11 : 13,
		width: "100%",
	};

	const labelStyle: React.CSSProperties = {
		fontSize: compact ? 10 : 11,
		color: "var(--text-muted)",
		fontWeight: 600,
	};

	if (compact) {
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<div
					style={{
						fontSize: 11,
						color: "var(--text-muted)",
						fontWeight: 600,
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<span>同期データ (SyncedData)</span>
				</div>
				<div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 6px" }}>
					<label style={{ ...labelStyle, alignSelf: "center" }}>Location_m</label>
					<input
						type="number"
						value={syncedData.Location_m ?? ""}
						onChange={(e) =>
							setSyncedData({ Location_m: e.target.value === "" ? null : Number(e.target.value) })
						}
						style={inputStyle}
						placeholder="未設定"
						step="0.1"
					/>
					<label style={{ ...labelStyle, alignSelf: "center" }}>Time_ms</label>
					<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
						<input
							type="number"
							value={syncedData.Time_ms ?? ""}
							onChange={(e) =>
								setSyncedData({ Time_ms: e.target.value === "" ? null : Number(e.target.value) })
							}
							style={{ ...inputStyle, flex: 1 }}
							placeholder="未設定"
							disabled={autoTimeMs}
						/>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: 2,
								fontSize: 10,
								whiteSpace: "nowrap",
							}}
							title="自動 (現在時刻)"
						>
							<input
								type="checkbox"
								checked={autoTimeMs}
								onChange={(e) => setAutoTimeMs(e.target.checked)}
							/>
							自動
						</label>
					</div>
					<label style={{ ...labelStyle, alignSelf: "center" }}>CanStart</label>
					<select
						value={
							syncedData.CanStart === true ? "true" : syncedData.CanStart === false ? "false" : ""
						}
						onChange={(e) => {
							if (e.target.value === "") setSyncedData({ CanStart: null });
							else setSyncedData({ CanStart: e.target.value === "true" });
						}}
						style={inputStyle}
					>
						<option value="">未設定</option>
						<option value="true">はい</option>
						<option value="false">いいえ</option>
					</select>
				</div>
				<div style={{ display: "flex", gap: 4 }}>
					<button
						onClick={toggleBroadcasting}
						style={{
							padding: "3px 10px",
							border: "none",
							borderRadius: 4,
							background: broadcasting ? "var(--danger)" : "var(--accent)",
							color: "#fff",
							fontSize: 11,
							cursor: "pointer",
							flex: 1,
						}}
					>
						{broadcasting ? "配信停止" : "定期配信開始"}
					</button>
					<button
						onClick={broadcast}
						style={{
							padding: "3px 10px",
							border: "1px solid var(--border)",
							borderRadius: 4,
							background: "transparent",
							fontSize: 11,
							cursor: "pointer",
						}}
					>
						一回送信
					</button>
				</div>
			</div>
		);
	}

	return (
		<div style={{ padding: "8px 12px" }}>
			<h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
				同期データ (SyncedData)
			</h4>

			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				<label style={labelStyle}>位置 Location_m</label>
				<input
					type="number"
					value={syncedData.Location_m ?? ""}
					onChange={(e) =>
						setSyncedData({ Location_m: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					step="0.1"
				/>

				<label style={labelStyle}>時刻 Time_ms (ミリ秒)</label>
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<input
						type="number"
						value={syncedData.Time_ms ?? ""}
						onChange={(e) =>
							setSyncedData({ Time_ms: e.target.value === "" ? null : Number(e.target.value) })
						}
						style={{ ...inputStyle, flex: 1 }}
						placeholder="未設定"
						disabled={autoTimeMs}
					/>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 4,
							fontSize: 12,
							whiteSpace: "nowrap",
						}}
					>
						<input
							type="checkbox"
							checked={autoTimeMs}
							onChange={(e) => setAutoTimeMs(e.target.checked)}
						/>
						自動 (現在時刻)
					</label>
				</div>

				<label style={labelStyle}>発車可能 CanStart</label>
				<select
					value={
						syncedData.CanStart === true ? "true" : syncedData.CanStart === false ? "false" : ""
					}
					onChange={(e) => {
						if (e.target.value === "") setSyncedData({ CanStart: null });
						else setSyncedData({ CanStart: e.target.value === "true" });
					}}
					style={inputStyle}
				>
					<option value="">未設定</option>
					<option value="true">はい</option>
					<option value="false">いいえ</option>
				</select>

				<div style={{ display: "flex", gap: 8, marginTop: 4 }}>
					<button
						onClick={toggleBroadcasting}
						style={{
							padding: "5px 14px",
							border: "none",
							borderRadius: 6,
							background: broadcasting ? "var(--danger)" : "var(--accent)",
							color: "#fff",
							fontSize: 13,
							cursor: "pointer",
							flex: 1,
						}}
					>
						{broadcasting ? "配信停止" : "定期配信開始"}
					</button>
					<button
						onClick={broadcast}
						style={{
							padding: "5px 14px",
							border: "1px solid var(--border)",
							borderRadius: 6,
							background: "transparent",
							fontSize: 13,
							cursor: "pointer",
						}}
					>
						一回送信
					</button>
				</div>
			</div>
		</div>
	);
}
