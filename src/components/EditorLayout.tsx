import { useState } from "react";
import {
	useEditorStore,
	selectActiveWorkGroup,
	selectActiveWork,
	selectActiveTrain,
} from "../store/editorStore";
import { WorkGroupTree } from "./Tree/WorkGroupTree";
import { WorkGroupForm } from "./Forms/WorkGroupForm";
import { WorkForm } from "./Forms/WorkForm";
import { TrainForm } from "./Forms/TrainForm";
import { TimetableRowForm } from "./Forms/TimetableRowForm";
import { TimetableTable } from "./TimetableTable";
import { MapPanel } from "./MapPanel";
import { RemoteSelectionBar } from "./RemoteSelectionBar";
import { RemoteCommandsPanel } from "./RemoteCommandsPanel";
import { SyncedDataPanel } from "./SyncedDataPanel";
import { Toolbar } from "./Toolbar";
import type { TimetableRowData } from "../types/trvis";

type RightTab = "form" | "synced" | "map";

export function EditorLayout() {
	const workGroups = useEditorStore((s) => s.workGroups);
	const activeWorkGroup = useEditorStore(selectActiveWorkGroup);
	const activeWork = useEditorStore(selectActiveWork);
	const activeTrain = useEditorStore(selectActiveTrain);
	const selection = useEditorStore((s) => s.selection);

	const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
	const [rightTab, setRightTab] = useState<RightTab>("form");

	const selectedRow: TimetableRowData | undefined = activeTrain?.TimetableRows.find(
		(r) => r.Id === selectedRowId,
	);

	const tabBtn = (tab: RightTab, label: string) => (
		<button
			onClick={() => setRightTab(tab)}
			style={{
				padding: "4px 12px",
				fontSize: 12,
				border: "none",
				borderBottom: tab === rightTab ? "2px solid var(--accent)" : "2px solid transparent",
				background: "transparent",
				color: tab === rightTab ? "var(--accent)" : "var(--text-muted)",
				cursor: "pointer",
				fontWeight: tab === rightTab ? 600 : 400,
			}}
		>
			{label}
		</button>
	);

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<Toolbar />
			<RemoteSelectionBar />
			<RemoteCommandsPanel />

			<div style={{ flex: 1, display: "flex", minHeight: 0 }}>
				{/* 左: ツリービュー */}
				<div
					style={{
						width: 220,
						minWidth: 180,
						borderRight: "1px solid var(--border)",
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
					}}
				>
					<WorkGroupTree workGroups={workGroups} />
				</div>

				{/* 中央: 時刻表テーブル */}
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
					}}
				>
					{activeTrain && selection.workGroupId && selection.workId ? (
						<TimetableTable
							workGroupId={selection.workGroupId}
							workId={selection.workId}
							train={activeTrain}
							selectedRowId={selectedRowId}
							onSelectRow={setSelectedRowId}
						/>
					) : (
						<div
							style={{
								flex: 1,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--text-muted)",
								fontSize: 14,
							}}
						>
							{activeWorkGroup
								? activeWork
									? "列車を選択してください"
									: "仕業を選択してください"
								: "仕業群を選択してください"}
						</div>
					)}
				</div>

				{/* 右: フォーム / 同期データ / 地図 */}
				<div
					style={{
						width: 300,
						minWidth: 260,
						borderLeft: "1px solid var(--border)",
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
					}}
				>
					{/* タブ */}
					<div
						style={{
							display: "flex",
							borderBottom: "1px solid var(--border)",
							padding: "0 4px",
							background: "var(--bg-panel)",
						}}
					>
						{tabBtn("form", "プロパティ")}
						{tabBtn("synced", "同期データ")}
						{tabBtn("map", "地図")}
					</div>

					<div style={{ flex: 1, overflowY: "auto" }}>
						{rightTab === "form" && (
							<>
								{selectedRow && selection.workGroupId && selection.workId && selection.trainId ? (
									<TimetableRowForm
										workGroupId={selection.workGroupId}
										workId={selection.workId}
										trainId={selection.trainId}
										row={selectedRow}
									/>
								) : activeTrain && selection.workGroupId && selection.workId ? (
									<TrainForm
										workGroupId={selection.workGroupId}
										workId={selection.workId}
										train={activeTrain}
									/>
								) : activeWork && selection.workGroupId ? (
									<WorkForm workGroupId={selection.workGroupId} work={activeWork} />
								) : activeWorkGroup ? (
									<WorkGroupForm workGroup={activeWorkGroup} />
								) : (
									<div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
										ツリーから項目を選択してください
									</div>
								)}
							</>
						)}
						{rightTab === "synced" && <SyncedDataPanel />}
						{rightTab === "map" && (
							<div style={{ height: 400 }}>
								<MapPanel />
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
