import { useMemo, useState } from "react";
import type { MonitorEntry } from "../../store/monitorStore";

interface Props {
	entry: MonitorEntry;
}

function fmtTime(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
		d.getMilliseconds(),
		3,
	)}`;
}

function prettify(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

const DIR_META: Record<MonitorEntry["direction"], { glyph: string; color: string; label: string }> =
	{
		in: { glyph: "▼", color: "#1a7f37", label: "受信" },
		out: { glyph: "▲", color: "var(--accent)", label: "送信" },
		system: { glyph: "◆", color: "var(--text-muted)", label: "系" },
	};

export function MonitorFrameRow({ entry }: Props) {
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	const dir = DIR_META[entry.direction];

	const pretty = useMemo(() => (expanded ? prettify(entry.body) : ""), [expanded, entry.body]);
	const preview = useMemo(() => entry.body.replace(/\s+/g, " ").slice(0, 200), [entry.body]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(entry.body);
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		} catch {
			/* clipboard 不可環境では何もしない */
		}
	};

	return (
		<div
			style={{
				borderBottom: "1px solid var(--border)",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: 12,
			}}
		>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					width: "100%",
					padding: "4px 8px",
					border: "none",
					background: "none",
					textAlign: "left",
					cursor: "pointer",
				}}
				title={dir.label}
			>
				<span style={{ color: dir.color, width: 12, flexShrink: 0 }}>{dir.glyph}</span>
				<span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{fmtTime(entry.ts)}</span>
				<span
					style={{
						flexShrink: 0,
						padding: "0 6px",
						borderRadius: 4,
						background: "var(--bg)",
						border: "1px solid var(--border)",
						color: "var(--text)",
					}}
				>
					{entry.messageType}
				</span>
				{entry.clientId && (
					<span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
						{entry.clientId.slice(0, 8)}
					</span>
				)}
				<span
					style={{
						color: "var(--text-muted)",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						flex: 1,
						minWidth: 0,
					}}
				>
					{preview}
				</span>
				{entry.truncated && (
					<span
						style={{ color: "var(--danger)", flexShrink: 0 }}
						title="本文が切り詰められています"
					>
						✂ {entry.originalLength}
					</span>
				)}
			</button>

			{expanded && (
				<div style={{ padding: "0 8px 8px 32px" }}>
					{entry.truncated && (
						<div style={{ color: "var(--danger)", marginBottom: 4 }}>
							先頭のみ表示中 (元 {entry.originalLength}{" "}
							文字)。完全な内容が必要なら設定で「本文を切り詰めない」を有効にしてください。
						</div>
					)}
					<pre
						style={{
							margin: 0,
							padding: 8,
							background: "var(--bg)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							overflowX: "auto",
							whiteSpace: "pre",
							maxHeight: 360,
						}}
					>
						{pretty}
					</pre>
					<button
						type="button"
						onClick={copy}
						style={{
							marginTop: 4,
							padding: "2px 10px",
							border: "1px solid var(--border)",
							borderRadius: 6,
							background: "var(--bg-panel)",
							fontSize: 11,
						}}
					>
						{copied ? "コピーしました" : "本文をコピー"}
					</button>
				</div>
			)}
		</div>
	);
}
