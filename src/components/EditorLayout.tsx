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
import { RemoteSelectionBar } from "./RemoteSelectionBar";
import { RemoteCommandsPanel } from "./RemoteCommandsPanel";
import { Toolbar } from "./Toolbar";
import { Dialog } from "./Dialog";
import { LocationMapDialog } from "./LocationMapDialog";

type EditTarget =
	| { kind: "workGroup"; workGroupId: string }
	| { kind: "work"; workGroupId: string; workId: string }
	| { kind: "train"; workGroupId: string; workId: string; trainId: string }
	| { kind: "row"; workGroupId: string; workId: string; trainId: string; rowId: string };

export function EditorLayout() {
	const workGroups = useEditorStore((s) => s.workGroups);
	const activeWorkGroup = useEditorStore(selectActiveWorkGroup);
	const activeWork = useEditorStore(selectActiveWork);
	const activeTrain = useEditorStore(selectActiveTrain);
	const selection = useEditorStore((s) => s.selection);

	const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
	const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
	const [locationMapOpen, setLocationMapOpen] = useState(false);

	const closeDialog = () => setEditTarget(null);

	// Re-resolve the edit target against the current store so dialog inputs
	// stay in sync with edits committed via the store.
	const resolveEditTargetData = () => {
		if (!editTarget) return null;
		const wg = workGroups.find((g) => g.Id === editTarget.workGroupId);
		if (!wg) return null;
		if (editTarget.kind === "workGroup") return { kind: "workGroup" as const, workGroup: wg };
		const w = wg.Works.find((x) => x.Id === editTarget.workId);
		if (!w) return null;
		if (editTarget.kind === "work") return { kind: "work" as const, workGroupId: wg.Id!, work: w };
		const t = w.Trains.find((x) => x.Id === editTarget.trainId);
		if (!t) return null;
		if (editTarget.kind === "train")
			return {
				kind: "train" as const,
				workGroupId: wg.Id!,
				workId: w.Id!,
				train: t,
			};
		const row = t.TimetableRows.find((x) => x.Id === editTarget.rowId);
		if (!row) return null;
		return {
			kind: "row" as const,
			workGroupId: wg.Id!,
			workId: w.Id!,
			trainId: t.Id!,
			row,
		};
	};
	const dialogData = resolveEditTargetData();

	const dialogTitle = dialogData
		? dialogData.kind === "workGroup"
			? "仕業群を編集"
			: dialogData.kind === "work"
				? "仕業を編集"
				: dialogData.kind === "train"
					? "列車を編集"
					: "時刻表行を編集"
		: "";

	const placeholder = activeWorkGroup
		? activeWork
			? "列車を選択してください"
			: "仕業を選択してください"
		: workGroups.length === 0
			? "ツリーから項目を選択してください"
			: "仕業群を選択してください";

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
					<WorkGroupTree
						workGroups={workGroups}
						onEditWorkGroup={(workGroupId) => setEditTarget({ kind: "workGroup", workGroupId })}
						onEditWork={(workGroupId, workId) =>
							setEditTarget({ kind: "work", workGroupId, workId })
						}
						onEditTrain={(workGroupId, workId, trainId) =>
							setEditTarget({ kind: "train", workGroupId, workId, trainId })
						}
					/>
				</div>

				{/* 右(中央): 時刻表テーブル */}
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
							onEditRowDetail={(rowId) =>
								setEditTarget({
									kind: "row",
									workGroupId: selection.workGroupId!,
									workId: selection.workId!,
									trainId: activeTrain.Id!,
									rowId,
								})
							}
							onOpenLocationMap={() => setLocationMapOpen(true)}
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
							{placeholder}
						</div>
					)}
				</div>
			</div>

			<LocationMapDialog open={locationMapOpen} onClose={() => setLocationMapOpen(false)} />

			<Dialog open={!!dialogData} title={dialogTitle} onClose={closeDialog} width={760}>
				{dialogData?.kind === "workGroup" && <WorkGroupForm workGroup={dialogData.workGroup} />}
				{dialogData?.kind === "work" && (
					<WorkForm workGroupId={dialogData.workGroupId} work={dialogData.work} />
				)}
				{dialogData?.kind === "train" && (
					<TrainForm
						workGroupId={dialogData.workGroupId}
						workId={dialogData.workId}
						train={dialogData.train}
					/>
				)}
				{dialogData?.kind === "row" && (
					<TimetableRowForm
						workGroupId={dialogData.workGroupId}
						workId={dialogData.workId}
						trainId={dialogData.trainId}
						row={dialogData.row}
					/>
				)}
			</Dialog>
		</div>
	);
}
