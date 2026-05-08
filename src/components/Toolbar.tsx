import { useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { broadcastAllWorkGroups } from "../api/wsServer";
import type { WorkGroupData } from "../types/trvis";

export function Toolbar() {
	const { workGroups, history, loadDocument, undo, redo, addWorkGroup } = useEditorStore();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileOpen = () => fileInputRef.current?.click();

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const json = JSON.parse(ev.target?.result as string);
				const data: WorkGroupData[] = Array.isArray(json) ? json : [json];
				loadDocument(data);
			} catch {
				alert("JSONの読み込みに失敗しました");
			}
		};
		reader.readAsText(file);
		e.target.value = "";
	};

	const handleExport = () => {
		const json = JSON.stringify(workGroups, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "trvis-data.json";
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
		</div>
	);
}
