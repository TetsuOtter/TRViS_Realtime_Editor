import { useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import {
	broadcastDefaultSound,
	broadcastDiagramInfo,
	broadcastHeaderColor,
	broadcastNotification,
	broadcastOperationCommand,
	broadcastServerInfo,
	broadcastTimeFormat,
} from "../api/wsServer";
import { selectActiveTrain, useEditorStore } from "../store/editorStore";
import type { OperationCommandAction } from "../types/trvis";
import {
	fileToBase64,
	fileToImageDataUri,
	isLikelyBase64,
	isLikelyLargeContent,
	soundFormatFromFileName,
} from "../types/trvisEnums";

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

const textInputStyle: React.CSSProperties = {
	padding: "3px 6px",
	border: "1px solid var(--border)",
	borderRadius: 4,
	background: "var(--bg)",
	fontSize: 12,
	width: "100%",
	boxSizing: "border-box",
};

function rgbStringToInt(hex: string): number | null {
	const m = hex.replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
	return parseInt(m, 16);
}

function intToRgbString(rgb: number): string {
	return "#" + rgb.toString(16).padStart(6, "0");
}

/** TZ オフセット無しの ISO 8601 風文字列 (端末の現在時刻をそのまま表示させたい場合用)。 */
function localIsoStringNoOffset(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 通告音 (Base64) の入力欄。ファイル選択で wav/mp3 を base64 化できる。
 * 大きな base64 を controlled な input にそのまま流すと描画が重くなるため、
 * base64 らしい長い内容はファイル添付直後に固定文字表示へ畳み、
 * ユーザが明示的に開いたときだけ input を描画する。
 */
function SoundPicker({
	base64,
	onBase64Change,
	format,
	onFormatChange,
	placeholder,
}: {
	base64: string;
	onBase64Change: (v: string) => void;
	format: string;
	onFormatChange: (v: string) => void;
	placeholder: string;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const heavy = isLikelyBase64(base64);
	const hideInput = heavy && !revealed;

	const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setBusy(true);
		try {
			const b64 = await fileToBase64(file);
			onBase64Change(b64);
			const fmt = soundFormatFromFileName(file.name);
			if (fmt) onFormatChange(fmt);
			setRevealed(false);
		} catch (err) {
			console.error("音声ファイルの読み込みに失敗しました:", err);
			alert(`音声ファイルの読み込みに失敗しました: ${err}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<input
				ref={fileRef}
				type="file"
				accept=".wav,.mp3,audio/wav,audio/mpeg"
				onChange={onPick}
				style={{ display: "none" }}
			/>
			<div style={{ display: "flex", gap: 4 }}>
				{hideInput ? (
					<div
						style={{
							...textInputStyle,
							flex: 1,
							color: "var(--text-muted)",
							background: "var(--bg-panel)",
						}}
					>
						base64 データ ({base64.length.toLocaleString()} 文字) — 描画が重いため既定で非表示
					</div>
				) : (
					<input
						type="text"
						placeholder={placeholder}
						value={base64}
						onChange={(e) => onBase64Change(e.target.value)}
						style={{ ...textInputStyle, flex: 1 }}
					/>
				)}
				<select
					value={format}
					onChange={(e) => onFormatChange(e.target.value)}
					style={{ ...textInputStyle, width: 72, flex: "0 0 auto" }}
				>
					<option value="">形式</option>
					<option value="wav">wav</option>
					<option value="mp3">mp3</option>
				</select>
			</div>
			<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					disabled={busy}
					style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}
				>
					{busy ? "読み込み中…" : "ファイルを選択 (wav/mp3)"}
				</button>
				{heavy && (
					<button type="button" onClick={() => setRevealed((r) => !r)} style={buttonStyle}>
						{revealed ? "テキストを隠す" : "テキストを表示/編集"}
					</button>
				)}
				{base64 && (
					<button
						type="button"
						onClick={() => {
							onBase64Change("");
							setRevealed(false);
						}}
						style={buttonStyle}
					>
						クリア
					</button>
				)}
			</div>
		</div>
	);
}

/**
 * サーバアイコン (ServerInfo.IconImage/IconImageDark) の入力欄。
 * ファイル選択で png/jpg/gif/svg を data URI 化できる。SoundPicker 同様、
 * 長い内容は既定で畳んで描画負荷を抑える。
 */
function ImagePicker({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const heavy = isLikelyLargeContent(value);
	const hideInput = heavy && !revealed;

	const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setBusy(true);
		try {
			const dataUri = await fileToImageDataUri(file);
			onChange(dataUri);
			setRevealed(false);
		} catch (err) {
			console.error("画像ファイルの読み込みに失敗しました:", err);
			alert(`画像ファイルの読み込みに失敗しました: ${err}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<input
				ref={fileRef}
				type="file"
				accept=".png,.jpg,.jpeg,.gif,.svg,image/png,image/jpeg,image/gif,image/svg+xml"
				onChange={onPick}
				style={{ display: "none" }}
			/>
			{hideInput ? (
				<div
					style={{
						...textInputStyle,
						color: "var(--text-muted)",
						background: "var(--bg-panel)",
					}}
				>
					data URI ({value.length.toLocaleString()} 文字) — 描画が重いため既定で非表示
				</div>
			) : (
				<input
					type="text"
					placeholder={placeholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					style={textInputStyle}
				/>
			)}
			<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					disabled={busy}
					style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}
				>
					{busy ? "読み込み中…" : "ファイルを選択 (png/jpg/gif/svg)"}
				</button>
				{heavy && (
					<button type="button" onClick={() => setRevealed((r) => !r)} style={buttonStyle}>
						{revealed ? "テキストを隠す" : "テキストを表示/編集"}
					</button>
				)}
				{value && (
					<button
						type="button"
						onClick={() => {
							onChange("");
							setRevealed(false);
						}}
						style={buttonStyle}
					>
						クリア
					</button>
				)}
			</div>
		</div>
	);
}

export function RemoteCommandsPanel() {
	const [open, setOpen] = useState(false);
	const [headerColor, setHeaderColor] = useState("#336699");
	const [notifId, setNotifId] = useState("");
	const [notifOrderNumber, setNotifOrderNumber] = useState("");
	const [notifTitle, setNotifTitle] = useState("");
	const [notifSummary, setNotifSummary] = useState("");
	const [notifBody, setNotifBody] = useState("");
	const [notifPriority, setNotifPriority] = useState(0);
	const [notifReceiver, setNotifReceiver] = useState("");
	const [notifSender, setNotifSender] = useState("");
	const [notifIconText, setNotifIconText] = useState("");
	const [notifIconColor, setNotifIconColor] = useState("#C62828");
	const [notifIconImageBase64, setNotifIconImageBase64] = useState("");
	/** 空 = 送信時に現在時刻 (TZ付き/UTC) を自動設定。編集すると送信時そのまま使う。 */
	const [notifIssuedAt, setNotifIssuedAt] = useState("");
	const [notifAcknowledged, setNotifAcknowledged] = useState(false);
	const [notifCompactDisplay, setNotifCompactDisplay] = useState(false);
	const [notifSectionStartStation, setNotifSectionStartStation] = useState("");
	const [notifSectionEndStation, setNotifSectionEndStation] = useState("");
	const [notifStationsBefore, setNotifStationsBefore] = useState(1);
	const [notifReceivedSoundBase64, setNotifReceivedSoundBase64] = useState("");
	const [notifReceivedSoundFormat, setNotifReceivedSoundFormat] = useState("");
	const [notifApproachSoundBase64, setNotifApproachSoundBase64] = useState("");
	const [notifApproachSoundFormat, setNotifApproachSoundFormat] = useState("");
	const [defaultReceivedSoundBase64, setDefaultReceivedSoundBase64] = useState("");
	const [defaultReceivedSoundFormat, setDefaultReceivedSoundFormat] = useState("");
	const [defaultApproachSoundBase64, setDefaultApproachSoundBase64] = useState("");
	const [defaultApproachSoundFormat, setDefaultApproachSoundFormat] = useState("");
	const [busy, setBusy] = useState(false);

	const serverInfo = useEditorStore((s) => s.serverInfo);
	const setServerInfo = useEditorStore((s) => s.setServerInfo);
	const diagramInfo = useEditorStore((s) => s.diagramInfo);
	const setDiagramInfo = useEditorStore((s) => s.setDiagramInfo);
	const workGroups = useEditorStore((s) => s.workGroups);
	const activeTrain = useEditorStore(selectActiveTrain);
	/** 現在表示中の列車の駅一覧 (区間指定プルダウンの候補)。Id があれば駅ID、無ければ駅名を値にする。 */
	const stationOptions =
		activeTrain?.TimetableRows.map((r) => ({
			value: r.Id || r.StationName,
			label: r.Id ? `${r.StationName} (${r.Id})` : r.StationName,
		})).filter((o) => o.value) ?? [];
	const [wgIdsText, setWgIdsText] = useState(() => diagramInfo.WorkGroupIds.join(", "));

	const commitWgIds = (text: string) => {
		setWgIdsText(text);
		setDiagramInfo({
			WorkGroupIds: text
				.split(/[,\s]+/)
				.map((s) => s.trim())
				.filter((s) => s !== ""),
		});
	};

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
						<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
							<input
								type="text"
								placeholder="ID (空=情報通知 / 指定=受領可能)"
								value={notifId}
								onChange={(e) => setNotifId(e.target.value)}
								style={{ ...textInputStyle, flex: 1 }}
							/>
							<button
								type="button"
								onClick={() => setNotifId(uuidv4())}
								style={buttonStyle}
								title="受領可能な通告にするための ID を生成"
							>
								生成
							</button>
						</div>
						<input
							type="text"
							placeholder="指令番号 (表示のみ)"
							value={notifOrderNumber}
							onChange={(e) => setNotifOrderNumber(e.target.value)}
							style={textInputStyle}
						/>
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
							placeholder="要約 (小型バナー表示用。空欄=タイトル)"
							value={notifSummary}
							onChange={(e) => setNotifSummary(e.target.value)}
							style={{
								padding: "3px 6px",
								border: "1px solid var(--border)",
								borderRadius: 4,
								background: "var(--bg)",
								fontSize: 12,
								minHeight: 32,
								resize: "vertical",
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
						<div style={{ display: "flex", gap: 4 }}>
							<input
								type="text"
								placeholder="受信者"
								value={notifReceiver}
								onChange={(e) => setNotifReceiver(e.target.value)}
								style={{ ...textInputStyle, flex: 1 }}
							/>
							<input
								type="text"
								placeholder="指令者"
								value={notifSender}
								onChange={(e) => setNotifSender(e.target.value)}
								style={{ ...textInputStyle, flex: 1 }}
							/>
						</div>
						<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
							<input
								type="text"
								placeholder="アイコン文字 (1〜2文字)"
								value={notifIconText}
								onChange={(e) => setNotifIconText(e.target.value)}
								maxLength={2}
								style={{ ...textInputStyle, flex: 1 }}
							/>
							<input
								type="color"
								value={/^#[0-9a-fA-F]{6}$/.test(notifIconColor) ? notifIconColor : "#C62828"}
								onChange={(e) => setNotifIconColor(e.target.value)}
								title="アイコン背景色"
								style={{ width: 32, height: 24, padding: 0, border: "1px solid var(--border)" }}
							/>
						</div>
						<input
							type="text"
							placeholder="アイコン画像 Base64 (data URI 可。指定時は文字/色より優先)"
							value={notifIconImageBase64}
							onChange={(e) => setNotifIconImageBase64(e.target.value)}
							style={textInputStyle}
						/>
						<SoundPicker
							base64={notifReceivedSoundBase64}
							onBase64Change={setNotifReceivedSoundBase64}
							format={notifReceivedSoundFormat}
							onFormatChange={setNotifReceivedSoundFormat}
							placeholder="受信音 Base64 (未指定=既定音/無音)"
						/>
						<SoundPicker
							base64={notifApproachSoundBase64}
							onBase64Change={setNotifApproachSoundBase64}
							format={notifApproachSoundFormat}
							onFormatChange={setNotifApproachSoundFormat}
							placeholder="接近音 Base64 (未指定=既定音/無音)"
						/>
						<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
							<input
								type="text"
								placeholder="発信日時 (空=送信時のUTC現在時刻)"
								value={notifIssuedAt}
								onChange={(e) => setNotifIssuedAt(e.target.value)}
								style={{ ...textInputStyle, flex: 1 }}
							/>
							<button
								type="button"
								onClick={() => setNotifIssuedAt(localIsoStringNoOffset(new Date()))}
								style={buttonStyle}
								title="端末の現在時刻を TZ オフセット無しでセット (TRViS側でそのまま表示される)"
							>
								今(TZなし)
							</button>
						</div>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 12,
								cursor: "pointer",
							}}
							title="受領済みとして送信する (受領ボタンは表示されず、既読扱いになる)"
						>
							<input
								type="checkbox"
								checked={notifAcknowledged}
								onChange={(e) => setNotifAcknowledged(e.target.checked)}
							/>
							受領済みとして送信 (Acknowledged)
						</label>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 12,
								cursor: "pointer",
							}}
						>
							<input
								type="checkbox"
								checked={notifCompactDisplay}
								onChange={(e) => setNotifCompactDisplay(e.target.checked)}
							/>
							小型バナー表示 (CompactDisplay)
						</label>
						<div style={{ display: "flex", gap: 4 }}>
							<input
								type="text"
								placeholder="区間開始駅 (駅名/駅ID)"
								value={notifSectionStartStation}
								onChange={(e) => setNotifSectionStartStation(e.target.value)}
								style={{ ...textInputStyle, flex: 1 }}
							/>
							<input
								type="text"
								placeholder="区間終了駅 (省略=単駅)"
								value={notifSectionEndStation}
								onChange={(e) => setNotifSectionEndStation(e.target.value)}
								style={{ ...textInputStyle, flex: 1 }}
							/>
						</div>
						<div style={{ display: "flex", gap: 4 }}>
							<select
								value=""
								onChange={(e) => {
									if (e.target.value) setNotifSectionStartStation(e.target.value);
									e.target.value = "";
								}}
								disabled={stationOptions.length === 0}
								title="現在表示中の列車の駅から選択 (駅IDで指定される)"
								style={{ ...textInputStyle, flex: 1 }}
							>
								<option value="">区間開始駅を選択...</option>
								{stationOptions.map((o) => (
									<option key={`start-${o.value}`} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
							<select
								value=""
								onChange={(e) => {
									if (e.target.value) setNotifSectionEndStation(e.target.value);
									e.target.value = "";
								}}
								disabled={stationOptions.length === 0}
								title="現在表示中の列車の駅から選択 (駅IDで指定される)"
								style={{ ...textInputStyle, flex: 1 }}
							>
								<option value="">区間終了駅を選択...</option>
								{stationOptions.map((o) => (
									<option key={`end-${o.value}`} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</div>
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
							<label
								style={{ ...labelStyle, fontWeight: 400 }}
								title="区間開始の何駅手前から再表示するか (既定1)"
							>
								StationsBefore:
								<input
									type="number"
									value={notifStationsBefore}
									onChange={(e) => setNotifStationsBefore(Number(e.target.value) || 0)}
									style={{
										width: 48,
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
												id: notifId.trim() || null,
												orderNumber: notifOrderNumber || null,
												title: notifTitle || null,
												summary: notifSummary || null,
												body: notifBody || null,
												priority: notifPriority,
												issuedAt: notifIssuedAt.trim() || new Date().toISOString(),
												receiver: notifReceiver || null,
												sender: notifSender || null,
												iconText: notifIconText || null,
												iconColorRgb: notifIconText
													? (rgbStringToInt(notifIconColor) ?? null)
													: null,
												iconImageBase64: notifIconImageBase64 || null,
												acknowledged: notifAcknowledged,
												compactDisplay: notifCompactDisplay,
												sectionStartStation: notifSectionStartStation.trim() || null,
												sectionEndStation: notifSectionEndStation.trim() || null,
												stationsBefore: notifStationsBefore,
												receivedSoundBase64: notifReceivedSoundBase64.trim() || null,
												receivedSoundFormat: notifReceivedSoundBase64.trim()
													? notifReceivedSoundFormat || null
													: null,
												approachSoundBase64: notifApproachSoundBase64.trim() || null,
												approachSoundFormat: notifApproachSoundBase64.trim()
													? notifApproachSoundFormat || null
													: null,
											}),
										"Notification.send",
									)
								}
								disabled={!notifTitle && !notifSummary && !notifBody}
								style={{
									...buttonStyle,
									color:
										!notifTitle && !notifSummary && !notifBody
											? "var(--text-muted)"
											: "var(--text)",
									cursor: !notifTitle && !notifSummary && !notifBody ? "not-allowed" : "pointer",
								}}
							>
								送信
							</button>
						</div>
					</div>

					{/* 通告音の既定値 */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
						<span style={labelStyle}>通告音の既定値 (DefaultSound)</span>
						<SoundPicker
							base64={defaultReceivedSoundBase64}
							onBase64Change={setDefaultReceivedSoundBase64}
							format={defaultReceivedSoundFormat}
							onFormatChange={setDefaultReceivedSoundFormat}
							placeholder="受信音 Base64 (未指定=既定を解除)"
						/>
						<SoundPicker
							base64={defaultApproachSoundBase64}
							onBase64Change={setDefaultApproachSoundBase64}
							format={defaultApproachSoundFormat}
							onFormatChange={setDefaultApproachSoundFormat}
							placeholder="接近音 Base64 (未指定=既定を解除)"
						/>
						<button
							onClick={() =>
								guard(
									() =>
										broadcastDefaultSound({
											receivedSoundBase64: defaultReceivedSoundBase64.trim() || null,
											receivedSoundFormat: defaultReceivedSoundBase64.trim()
												? defaultReceivedSoundFormat || null
												: null,
											approachSoundBase64: defaultApproachSoundBase64.trim() || null,
											approachSoundFormat: defaultApproachSoundBase64.trim()
												? defaultApproachSoundFormat || null
												: null,
										}),
									"DefaultSound.send",
								)
							}
							style={buttonStyle}
							title="両ロールを送信内容でフルに置き換える。空欄のロールは既定なし (無音) にリセットされる"
						>
							適用
						</button>
					</div>

					{/* サーバー情報 */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
						<span style={labelStyle}>サーバー情報 (ServerInfo)</span>
						<input
							type="text"
							placeholder="Name"
							value={serverInfo.Name}
							onChange={(e) => setServerInfo({ Name: e.target.value })}
							style={textInputStyle}
						/>
						<input
							type="text"
							placeholder="Admin (連絡先)"
							value={serverInfo.Admin}
							onChange={(e) => setServerInfo({ Admin: e.target.value })}
							style={textInputStyle}
						/>
						<div style={{ display: "flex", gap: 4 }}>
							<input
								type="text"
								placeholder="Version (空=アプリ版)"
								value={serverInfo.Version}
								onChange={(e) => setServerInfo({ Version: e.target.value })}
								style={textInputStyle}
							/>
							<input
								type="text"
								placeholder="ProtocolVersion"
								value={serverInfo.ProtocolVersion}
								onChange={(e) => setServerInfo({ ProtocolVersion: e.target.value })}
								style={textInputStyle}
							/>
						</div>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: 12,
								cursor: "pointer",
							}}
						>
							<input
								type="checkbox"
								checked={serverInfo.TrainSearchEnabled}
								onChange={(e) => setServerInfo({ TrainSearchEnabled: e.target.checked })}
							/>
							列車検索 (TrainSearch) に対応する
						</label>
						<span style={labelStyle}>アイコン (ライトモード)</span>
						<ImagePicker
							value={serverInfo.IconImage}
							onChange={(v) => setServerInfo({ IconImage: v })}
							placeholder="IconImage (data URI)"
						/>
						<span style={labelStyle}>アイコン (ダークモード・任意)</span>
						<ImagePicker
							value={serverInfo.IconImageDark}
							onChange={(v) => setServerInfo({ IconImageDark: v })}
							placeholder="IconImageDark (data URI、省略時はライト版を流用)"
						/>
						<button
							onClick={() =>
								guard(
									() =>
										broadcastServerInfo({
											name: serverInfo.Name.trim() || null,
											admin: serverInfo.Admin.trim() || null,
											version: serverInfo.Version.trim() || null,
											protocolVersion: serverInfo.ProtocolVersion.trim() || null,
											features: serverInfo.TrainSearchEnabled ? ["TrainSearch"] : null,
											iconImage: serverInfo.IconImage.trim() || null,
											iconImageDark: serverInfo.IconImageDark.trim() || null,
										}),
									"ServerInfo.broadcast",
								)
							}
							style={buttonStyle}
						>
							ブロードキャスト
						</button>
					</div>

					{/* ダイヤ情報 */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
						<span style={labelStyle}>ダイヤ情報 (DiagramInfo)</span>
						<input
							type="text"
							placeholder="DiagramId"
							value={diagramInfo.DiagramId}
							onChange={(e) => setDiagramInfo({ DiagramId: e.target.value })}
							style={textInputStyle}
						/>
						<input
							type="text"
							placeholder="Name (ダイヤ名)"
							value={diagramInfo.Name}
							onChange={(e) => setDiagramInfo({ Name: e.target.value })}
							style={textInputStyle}
						/>
						<textarea
							placeholder="Description (説明)"
							value={diagramInfo.Description}
							onChange={(e) => setDiagramInfo({ Description: e.target.value })}
							style={{ ...textInputStyle, minHeight: 40, resize: "vertical" }}
						/>
						<input
							type="text"
							placeholder="WorkGroupIds (カンマ区切り)"
							value={wgIdsText}
							onChange={(e) => commitWgIds(e.target.value)}
							style={textInputStyle}
						/>
						<div style={{ display: "flex", gap: 4 }}>
							<button
								onClick={() =>
									commitWgIds(
										workGroups
											.map((g) => g.Id)
											.filter((id): id is string => !!id)
											.join(", "),
									)
								}
								disabled={workGroups.length === 0}
								style={{
									...buttonStyle,
									color: workGroups.length === 0 ? "var(--text-muted)" : "var(--text)",
									cursor: workGroups.length === 0 ? "not-allowed" : "pointer",
								}}
							>
								現在のWorkGroupで埋める
							</button>
							<button
								onClick={() =>
									guard(() => {
										const ids = wgIdsText
											.split(/[,\s]+/)
											.map((s) => s.trim())
											.filter((s) => s !== "");
										return broadcastDiagramInfo({
											diagramId: diagramInfo.DiagramId.trim() || null,
											name: diagramInfo.Name.trim() || null,
											description: diagramInfo.Description.trim() || null,
											workGroupIds: ids.length > 0 ? ids : null,
										});
									}, "DiagramInfo.broadcast")
								}
								style={buttonStyle}
							>
								ブロードキャスト
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
