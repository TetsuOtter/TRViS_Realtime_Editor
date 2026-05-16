import { useState } from "react";
import { sendRawMessage } from "../../api/wsServer";
import { useMonitorStore } from "../../store/monitorStore";
import { Dialog } from "../Dialog";
import { JsonEditor } from "../../jsonEditor/JsonEditor";

interface Props {
	/** モニタで観測済みのクライアント ID 候補 (送信先選択用) */
	knownClients: string[];
}

function looksLikeJson(text: string): boolean {
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}

export function MonitorComposer({ knownClients }: Props) {
	const sendOnKey = useMonitorStore((s) => s.settings.sendOnKey);
	const setSendOnKey = useMonitorStore((s) => s.setSendOnKey);
	const pushSystem = useMonitorStore((s) => s.pushSystem);

	const [text, setText] = useState("");
	const [target, setTarget] = useState<string>(""); // "" = 全クライアント
	const [expanded, setExpanded] = useState(false);
	const [busy, setBusy] = useState(false);

	const doSend = async (value: string) => {
		const body = value.trim();
		if (!body || busy) return;
		if (!looksLikeJson(body)) {
			const ok = window.confirm("入力内容は妥当な JSON ではありません。このまま送信しますか?");
			if (!ok) return;
		}
		setBusy(true);
		try {
			const clientId = target || undefined;
			const delivered = await sendRawMessage(body, clientId);
			if (!delivered && clientId) {
				pushSystem(`送信先 ${clientId.slice(0, 8)} は既に切断されています`);
			}
			setText("");
			setExpanded(false);
		} catch (e) {
			pushSystem(`送信に失敗しました: ${String(e)}`);
		} finally {
			setBusy(false);
		}
	};

	const onInlineKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		const mod = e.metaKey || e.ctrlKey;
		if (e.key !== "Enter") return;
		if (sendOnKey === "enter") {
			// Enter 送信モード: 素の Enter で送信。改行したいときは Shift/Mod+Enter。
			if (!e.shiftKey && !mod) {
				e.preventDefault();
				void doSend(text);
			}
		} else {
			// Mod+Enter 送信モード: Ctrl/Cmd+Enter で送信。
			if (mod) {
				e.preventDefault();
				void doSend(text);
			}
		}
	};

	const selectStyle: React.CSSProperties = {
		padding: "3px 6px",
		border: "1px solid var(--border)",
		borderRadius: 6,
		background: "var(--bg-panel)",
		fontSize: 12,
	};
	const btnStyle: React.CSSProperties = {
		padding: "4px 12px",
		border: "1px solid var(--border)",
		borderRadius: 6,
		background: "var(--bg-panel)",
		fontSize: 12,
	};

	return (
		<div
			style={{
				borderTop: "1px solid var(--border)",
				background: "var(--bg-panel)",
				padding: 8,
				display: "flex",
				flexDirection: "column",
				gap: 6,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
				<span style={{ fontSize: 12, color: "var(--text-muted)" }}>送信先</span>
				<select
					value={target}
					onChange={(e) => setTarget(e.target.value)}
					style={selectStyle}
					title="送信先クライアント"
				>
					<option value="">全クライアント</option>
					{knownClients.map((c) => (
						<option key={c} value={c}>
							{c.slice(0, 8)}
						</option>
					))}
				</select>

				<span
					style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}
					title="小さい入力欄での送信キー。リッチ入力欄では常に Ctrl/Cmd+Enter で送信します。"
				>
					送信キー
				</span>
				<label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 3 }}>
					<input
						type="radio"
						name="monitor-send-key"
						checked={sendOnKey === "enter"}
						onChange={() => setSendOnKey("enter")}
						style={{ accentColor: "var(--accent)" }}
					/>
					Enter
				</label>
				<label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 3 }}>
					<input
						type="radio"
						name="monitor-send-key"
						checked={sendOnKey === "mod-enter"}
						onChange={() => setSendOnKey("mod-enter")}
						style={{ accentColor: "var(--accent)" }}
					/>
					Ctrl/Cmd+Enter
				</label>

				<button
					type="button"
					onClick={() => setExpanded(true)}
					style={{ ...btnStyle, marginLeft: "auto" }}
					title="CodeMirror でリッチ編集"
				>
					⤢ 拡大入力
				</button>
			</div>

			<div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
				<textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onInlineKeyDown}
					placeholder='送信する JSON を入力 (例: {"MessageType":"ServerInfo","Name":"test"})'
					rows={2}
					style={{
						flex: 1,
						resize: "vertical",
						minHeight: 40,
						padding: 6,
						border: "1px solid var(--border)",
						borderRadius: 6,
						background: "var(--bg)",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: 12,
					}}
				/>
				<button
					type="button"
					onClick={() => void doSend(text)}
					disabled={busy || text.trim().length === 0}
					style={{
						...btnStyle,
						background: "var(--accent)",
						color: "#fff",
						border: "1px solid var(--accent)",
						opacity: busy || text.trim().length === 0 ? 0.5 : 1,
					}}
				>
					送信
				</button>
			</div>

			<Dialog
				open={expanded}
				title="メッセージを編集して送信 (Ctrl/Cmd+Enter で送信)"
				onClose={() => setExpanded(false)}
				fullscreen
			>
				<ExpandedEditor
					initial={text}
					busy={busy}
					onCancel={() => setExpanded(false)}
					onChangeText={setText}
					onSend={(v) => void doSend(v)}
				/>
			</Dialog>
		</div>
	);
}

function ExpandedEditor({
	initial,
	busy,
	onCancel,
	onChangeText,
	onSend,
}: {
	initial: string;
	busy: boolean;
	onCancel: () => void;
	onChangeText: (v: string) => void;
	onSend: (v: string) => void;
}) {
	const [value, setValue] = useState(initial);

	return (
		<div
			style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12 }}
			onKeyDown={(e) => {
				if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					onSend(value);
				}
			}}
		>
			<div style={{ flex: 1, minHeight: 0, display: "flex" }}>
				<JsonEditor
					value={value}
					onChange={(v) => {
						setValue(v);
						onChangeText(v);
					}}
				/>
			</div>
			<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
				<button
					type="button"
					onClick={onCancel}
					style={{
						padding: "6px 16px",
						border: "1px solid var(--border)",
						borderRadius: 6,
						background: "var(--bg-panel)",
						fontSize: 13,
					}}
				>
					閉じる
				</button>
				<button
					type="button"
					onClick={() => onSend(value)}
					disabled={busy || value.trim().length === 0}
					style={{
						padding: "6px 16px",
						border: "1px solid var(--accent)",
						borderRadius: 6,
						background: "var(--accent)",
						color: "#fff",
						fontSize: 13,
						opacity: busy || value.trim().length === 0 ? 0.5 : 1,
					}}
				>
					送信
				</button>
			</div>
		</div>
	);
}
