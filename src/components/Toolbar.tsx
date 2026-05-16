import { useMemo, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { useMonitorStore } from "../store/monitorStore";
import { broadcastAllWorkGroups, openMonitorWindow } from "../api/wsServer";
import { JsonEditDialog, type JsonEditDialogMode } from "../jsonEditor/JsonEditDialog";
import { tryParseDocument, type ParseError } from "../jsonEditor/parseDocument";
import { ThirdPartyLicensesDialog } from "./ThirdPartyLicensesDialog";
import { AppInfoDialog } from "./AppInfoDialog";

interface JsonDialogState {
	mode: JsonEditDialogMode;
	initialText: string;
	initialErrors?: ParseError[];
}

export function Toolbar() {
	const { workGroups, history, undo, redo, addWorkGroup, liveBroadcast, setLiveBroadcast } =
		useEditorStore();
	const monitorOpen = useMonitorStore((s) => s.open);
	const monitorDock = useMonitorStore((s) => s.settings.dock);
	const setMonitorOpen = useMonitorStore((s) => s.setOpen);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [jsonDialog, setJsonDialog] = useState<JsonDialogState | null>(null);
	const [licensesOpen, setLicensesOpen] = useState(false);
	const [appInfoOpen, setAppInfoOpen] = useState(false);

	const handleFileOpen = () => fileInputRef.current?.click();

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = (ev.target?.result as string) ?? "";
			const r = tryParseDocument(text);
			if (r.ok) {
				useEditorStore.getState().loadDocument(r.data);
				return;
			}
			// 失敗時は内容と理由をエディタダイアログに渡し、ユーザがその場で直せるようにする。
			setJsonDialog({
				mode: "fix-load",
				initialText: text,
				initialErrors: r.errors,
			});
		};
		reader.readAsText(file);
		e.target.value = "";
	};

	const currentJsonText = useMemo(() => JSON.stringify(workGroups, null, 2), [workGroups]);

	const handleEditJson = () => {
		setJsonDialog({
			mode: "edit",
			initialText: currentJsonText,
		});
	};

	const handleExport = async () => {
		const json = currentJsonText;
		const defaultName = `trvis-data-${new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.slice(0, 19)}.json`;

		// Tauri 環境ではネイティブの保存ダイアログを開いて、選んだパスへ書き出す。
		// それ以外 (vite dev / vitest 等) ではブラウザのダウンロードにフォールバックする。
		if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
			try {
				const { save } = await import("@tauri-apps/plugin-dialog");
				const { invoke } = await import("@tauri-apps/api/core");
				const path = await save({
					title: "JSONをエクスポート",
					defaultPath: defaultName,
					filters: [{ name: "JSON", extensions: ["json"] }],
				});
				if (!path) return; // キャンセル
				await invoke("write_text_file", { path, contents: json });
			} catch (e) {
				console.error("export failed:", e);
				alert(`エクスポートに失敗しました: ${e}`);
			}
			return;
		}

		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = defaultName;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleBroadcastAll = async () => {
		try {
			await broadcastAllWorkGroups(workGroups);
		} catch (e) {
			console.error("broadcastAllWorkGroups failed:", e);
		}
	};

	const handleToggleMonitor = () => {
		if (monitorDock === "window") {
			void openMonitorWindow();
			return;
		}
		setMonitorOpen(!monitorOpen);
	};
	const monitorActive = monitorDock === "window" ? false : monitorOpen;

	const btnStyle: React.CSSProperties = {
		padding: "4px 12px",
		border: "1px solid var(--border)",
		borderRadius: 6,
		background: "var(--bg-panel)",
		fontSize: 13,
		cursor: "pointer",
	};

	return (
		<div
			style={{
				padding: "6px 12px",
				background: "var(--bg-panel)",
				borderBottom: "1px solid var(--border)",
				display: "flex",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap",
			}}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".json"
				onChange={handleFileChange}
				style={{ display: "none" }}
			/>

			<button onClick={handleFileOpen} style={btnStyle}>
				JSONを開く
			</button>

			<button onClick={handleExport} style={btnStyle}>
				JSONをエクスポート
			</button>

			<button onClick={handleEditJson} style={btnStyle} title="現在のデータを JSON で直接編集">
				JSONを編集
			</button>

			<div style={{ width: 1, height: 20, background: "var(--border)" }} />

			<button
				onClick={undo}
				disabled={history.past.length === 0}
				style={{
					...btnStyle,
					opacity: history.past.length === 0 ? 0.4 : 1,
				}}
				title="元に戻す (Ctrl+Z)"
			>
				↩ 元に戻す
			</button>

			<button
				onClick={redo}
				disabled={history.future.length === 0}
				style={{
					...btnStyle,
					opacity: history.future.length === 0 ? 0.4 : 1,
				}}
				title="やり直す (Ctrl+Y)"
			>
				↪ やり直す
			</button>

			<div style={{ width: 1, height: 20, background: "var(--border)" }} />

			<button onClick={() => addWorkGroup()} style={btnStyle}>
				+ 仕業群追加
			</button>

			<button onClick={handleBroadcastAll} style={btnStyle} title="全データをTRViSに配信">
				全データ配信
			</button>

			<label
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "4px 10px",
					border: "1px solid var(--border)",
					borderRadius: 6,
					background: liveBroadcast ? "var(--accent)" : "var(--bg-panel)",
					color: liveBroadcast ? "#fff" : "var(--text)",
					fontSize: 12,
					cursor: "pointer",
				}}
				title="編集の度に全データを自動配信します。現状の TRViS は自スコープの更新で表示が初期化されるため、リアルタイム編集 UX には TRViS 側の対応が必要です (TetsuOtter/TRViS#214)"
			>
				<input
					type="checkbox"
					checked={liveBroadcast}
					onChange={(e) => setLiveBroadcast(e.target.checked)}
					style={{ accentColor: "var(--accent)" }}
				/>
				ライブモード
			</label>

			<button
				onClick={handleToggleMonitor}
				style={{
					...btnStyle,
					marginLeft: "auto",
					background: monitorActive ? "var(--accent)" : "var(--bg-panel)",
					color: monitorActive ? "#fff" : "var(--text)",
				}}
				title="送受信 JSON を時刻付きで表示し、任意の内容を手動送信できるデバッグ用モニタ"
			>
				通信モニタ
			</button>

			<button
				onClick={() => setAppInfoOpen(true)}
				style={btnStyle}
				title="バージョン・コミットハッシュなどのビルド情報を表示"
			>
				アプリ情報
			</button>

			<button
				onClick={() => setLicensesOpen(true)}
				style={btnStyle}
				title="このアプリが利用しているサードパーティ OSS のライセンス一覧を表示"
			>
				サードパーティライセンス
			</button>

			<AppInfoDialog open={appInfoOpen} onClose={() => setAppInfoOpen(false)} />
			<ThirdPartyLicensesDialog open={licensesOpen} onClose={() => setLicensesOpen(false)} />

			<JsonEditDialog
				open={jsonDialog !== null}
				mode={jsonDialog?.mode ?? "edit"}
				initialText={jsonDialog?.initialText ?? ""}
				initialErrors={jsonDialog?.initialErrors}
				onClose={() => setJsonDialog(null)}
			/>
		</div>
	);
}
