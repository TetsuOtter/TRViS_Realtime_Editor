import { useState } from "react";

import {
	broadcastHeaderColor,
	broadcastNotification,
	broadcastOperationCommand,
	broadcastTimeFormat,
} from "../api/wsServer";
import type { OperationCommandAction } from "../types/trvis";

const OPERATION_BUTTONS: { action: OperationCommandAction; label: string; danger?: boolean }[] = [
	{ action: "StartOperation", label: "運行開始" },
	{ action: "EndOperation", label: "運行終了", danger: true },
	{ action: "EnableLocationService", label: "位置情報ON" },
	{ action: "DisableLocationService", label: "位置情報OFF" },
];

const TIME_FORMAT_PRESETS: { label: string; format: string | null }[] = [
	{ label: "既定", format: null },
	{ label: "HH:mm", format: "HH:mm" },
	{ label: "HH:mm:ss", format: "HH:mm:ss" },
];

const labelStyle: React.CSSProperties = {
	fontSize: 11,
	color: "var(--text-muted)",
	fontWeight: 600,
};

const buttonStyle: React.CSSProperties = {
	padding: "3px 10px",
	fontSize: 12,
	border: "1px solid var(--border)",
	borderRadius: 4,
	background: "transparent",
	color: "var(--text)",
	cursor: "pointer",
};

function rgbStringToInt(hex: string): number | null {
	const m = hex.replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
	return parseInt(m, 16);
}

function intToRgbString(rgb: number): string {
	return "#" + rgb.toString(16).padStart(6, "0");
}

export function RemoteCommandsPanel() {
	const [open, setOpen] = useState(false);
	const [headerColor, setHeaderColor] = useState("#336699");
	const [notifTitle, setNotifTitle] = useState("");
	const [notifBody, setNotifBody] = useState("");
	const [notifPriority, setNotifPriority] = useState(0);
	const [busy, setBusy] = useState(false);

	const guard = async (fn: () => Promise<void>, label: string) => {
		if (busy) return;
		setBusy(true);
		try {
			await fn();
		} catch (e) {
			console.error(`${label} failed:`, e);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			style={{
				padding: "6px 12px",
				background: "var(--bg-panel)",
				borderBottom: "1px solid var(--border)",
				fontSize: 12,
			}}
		>
			<button
				onClick={() => setOpen((v) => !v)}
				style={{
					...buttonStyle,
					padding: "2px 8px",
					fontSize: 11,
				}}
				aria-expanded={open}
			>
				リモートコマンド {open ? "▾" : "▸"}
			</button>

			{open && (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 16,
						marginTop: 8,
					}}
				>
					{/* 運行操作 */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<span style={labelStyle}>運行操作 (OperationCommand)</span>
						<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
							{OPERATION_BUTTONS.map((b) => (
								<button
									key={b.action}
									onClick={() =>
										guard(
											() => broadcastOperationCommand(b.action),
											`OperationCommand(${b.action})`,
										)
									}
									style={{
										...buttonStyle,
										color: b.danger ? "var(--danger)" : "var(--text)",
										borderColor: b.danger ? "var(--danger)" : "var(--border)",
									}}
								>
									{b.label}
								</button>
							))}
						</div>
					</div>

					{/* タイトルバー色 */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<span style={labelStyle}>ヘッダ色 (HeaderColor)</span>
						<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
							<input
								type="color"
								value={headerColor}
								onChange={(e) => setHeaderColor(e.target.value)}
								style={{ width: 32, height: 24, border: "1px solid var(--border)", padding: 0 }}
							/>
							<button
								onClick={() => {
									const rgb = rgbStringToInt(headerColor);
									if (rgb === null) return;
									guard(
										() => broadcastHeaderColor({ resetToDefault: false, colorRgb: rgb }),
										"HeaderColor.set",
									);
								}}
								style={buttonStyle}
							>
								適用 ({intToRgbString(rgbStringToInt(headerColor) ?? 0)})
							</button>
							<button
								onClick={() =>
									guard(() => broadcastHeaderColor({ resetToDefault: true }), "HeaderColor.reset")
								}
								style={buttonStyle}
							>
								既定に戻す
							</button>
						</div>
					</div>

					{/* 時刻表示フォーマット */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<span style={labelStyle}>時刻表示 (TimeFormat)</span>
						<div style={{ display: "flex", gap: 4 }}>
							{TIME_FORMAT_PRESETS.map((p) => (
								<button
									key={p.label}
									onClick={() =>
										guard(() => broadcastTimeFormat(p.format), `TimeFormat(${p.label})`)
									}
									style={buttonStyle}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>

					{/* 通告 */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
						<span style={labelStyle}>通告 (Notification)</span>
						<input
							type="text"
							placeholder="タイトル"
							value={notifTitle}
							onChange={(e) => setNotifTitle(e.target.value)}
							style={{
								padding: "3px 6px",
								border: "1px solid var(--border)",
								borderRadius: 4,
								background: "var(--bg)",
								fontSize: 12,
							}}
						/>
						<textarea
							placeholder="本文"
							value={notifBody}
							onChange={(e) => setNotifBody(e.target.value)}
							style={{
								padding: "3px 6px",
								border: "1px solid var(--border)",
								borderRadius: 4,
								background: "var(--bg)",
								fontSize: 12,
								minHeight: 40,
								resize: "vertical",
							}}
						/>
						<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
							<label style={{ ...labelStyle, fontWeight: 400 }}>
								Priority:
								<input
									type="number"
									value={notifPriority}
									onChange={(e) => setNotifPriority(Number(e.target.value) || 0)}
									style={{
										width: 56,
										marginLeft: 4,
										padding: "2px 4px",
										border: "1px solid var(--border)",
										borderRadius: 4,
										background: "var(--bg)",
										fontSize: 12,
									}}
								/>
							</label>
							<button
								onClick={() =>
									guard(
										() =>
											broadcastNotification({
												title: notifTitle || null,
												body: notifBody || null,
												priority: notifPriority,
												issuedAt: new Date().toISOString(),
											}),
										"Notification.send",
									)
								}
								disabled={!notifTitle && !notifBody}
								style={{
									...buttonStyle,
									color: !notifTitle && !notifBody ? "var(--text-muted)" : "var(--text)",
									cursor: !notifTitle && !notifBody ? "not-allowed" : "pointer",
								}}
							>
								送信
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
