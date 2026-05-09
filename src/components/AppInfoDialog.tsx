import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";

interface Props {
	open: boolean;
	onClose: () => void;
}

interface AppInfo {
	version: string;
	commit: string;
}

type LoadState =
	| { kind: "idle" }
	| { kind: "loading" }
	| { kind: "ready"; info: AppInfo }
	| { kind: "error"; message: string };

export function AppInfoDialog({ open, onClose }: Props) {
	const [state, setState] = useState<LoadState>({ kind: "idle" });
	const [copied, setCopied] = useState<"version" | "commit" | "short" | null>(null);

	useEffect(() => {
		if (!open) return;
		if (state.kind !== "idle") return;
		setState({ kind: "loading" });
		(async () => {
			try {
				if (!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
					// Tauri 環境外 (vite dev / vitest) は実バイナリではないので
					// commit hash の埋め込みもなし。プレースホルダで表示する。
					setState({
						kind: "ready",
						info: { version: "dev", commit: "unknown" },
					});
					return;
				}
				const { invoke } = await import("@tauri-apps/api/core");
				const info = await invoke<AppInfo>("get_app_info");
				setState({ kind: "ready", info });
			} catch (e) {
				setState({ kind: "error", message: String(e) });
			}
		})();
	}, [open, state.kind]);

	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(null), 1500);
		return () => clearTimeout(t);
	}, [copied]);

	const copy = async (key: "version" | "commit" | "short", value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(key);
		} catch (e) {
			console.error("clipboard write failed:", e);
			alert(`コピーに失敗しました: ${e}`);
		}
	};

	const info = state.kind === "ready" ? state.info : null;
	const shortCommit = info && info.commit !== "unknown" ? info.commit.slice(0, 12) : info?.commit;

	return (
		<Dialog open={open} title="アプリ情報" onClose={onClose}>
			<div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
				{state.kind === "loading" && (
					<div style={{ color: "var(--text-muted)" }}>読み込み中...</div>
				)}
				{state.kind === "error" && (
					<div style={{ color: "var(--danger)" }}>
						アプリ情報を取得できませんでした: {state.message}
					</div>
				)}
				{info && (
					<>
						<Field
							label="バージョン"
							value={info.version}
							onCopy={() => copy("version", info.version)}
							copied={copied === "version"}
						/>
						<Field
							label="コミットハッシュ (短縮)"
							value={shortCommit ?? ""}
							mono
							onCopy={() => copy("short", shortCommit ?? "")}
							copied={copied === "short"}
							disabled={info.commit === "unknown"}
						/>
						<Field
							label="コミットハッシュ"
							value={info.commit}
							mono
							breakAll
							onCopy={() => copy("commit", info.commit)}
							copied={copied === "commit"}
							disabled={info.commit === "unknown"}
						/>
						{info.commit === "unknown" && (
							<div style={{ fontSize: 12, color: "var(--text-muted)" }}>
								このビルドには git コミット情報が埋め込まれていません。
							</div>
						)}
					</>
				)}
			</div>
		</Dialog>
	);
}

interface FieldProps {
	label: string;
	value: string;
	mono?: boolean;
	breakAll?: boolean;
	onCopy: () => void;
	copied: boolean;
	disabled?: boolean;
}

function Field({ label, value, mono, breakAll, onCopy, copied, disabled }: FieldProps) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.3 }}>{label}</div>
			<div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						padding: "6px 10px",
						border: "1px solid var(--border)",
						borderRadius: 4,
						background: "var(--bg-panel)",
						fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
						fontSize: 13,
						wordBreak: breakAll ? "break-all" : undefined,
						userSelect: "all",
					}}
				>
					{value}
				</div>
				<button
					type="button"
					onClick={onCopy}
					disabled={disabled}
					style={{
						padding: "0 12px",
						fontSize: 12,
						border: "1px solid var(--border)",
						borderRadius: 4,
						background: copied ? "var(--accent)" : "var(--bg-panel)",
						color: copied ? "#fff" : "var(--text)",
						cursor: disabled ? "not-allowed" : "pointer",
						opacity: disabled ? 0.4 : 1,
						whiteSpace: "nowrap",
					}}
					title="クリップボードにコピー"
				>
					{copied ? "コピー済" : "コピー"}
				</button>
			</div>
		</div>
	);
}
