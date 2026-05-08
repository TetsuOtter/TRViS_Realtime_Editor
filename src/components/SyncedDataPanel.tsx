import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { setSyncedData as apiSetSyncedData } from "../api/wsServer";

const BROADCAST_INTERVAL_MS = 1000;

export function SyncedDataPanel() {
	const { syncedData, autoTimeMs, setSyncedData, setAutoTimeMs } = useEditorStore();
	const [broadcasting, setBroadcasting] = useState(false);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const broadcast = async () => {
		const timeMs = autoTimeMs ? Date.now() % 86400000 : (syncedData.Time_ms ?? 0);
		try {
			await apiSetSyncedData({
				locationM: syncedData.Location_m,
				timeMs,
				canStart: syncedData.CanStart ?? false,
			});
		} catch {
			// Tauri環境でなければ何もしない
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
		padding: "4px 8px",
		border: "1px solid var(--border)",
		borderRadius: 4,
		background: "var(--bg)",
		fontSize: 13,
		width: "100%",
	};

	return (
		<div style={{ padding: "8px 12px" }}>
			<h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
				同期データ (SyncedData)
			</h4>

			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				<label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
					位置 Location_m
				</label>
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

				<label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
					時刻 Time_ms (ミリ秒)
				</label>
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

				<label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
					発車可能 CanStart
				</label>
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
						onClick={() => {
							setBroadcasting((v) => !v);
						}}
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
