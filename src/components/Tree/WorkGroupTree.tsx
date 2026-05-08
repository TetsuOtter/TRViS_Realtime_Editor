import { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { WorkGroupData } from "../../types/trvis";

interface Props {
	workGroups: WorkGroupData[];
}

interface ContextMenu {
	type: "workGroup" | "work" | "train";
	id: string;
	parentIds: string[];
	x: number;
	y: number;
}

const rowStyle = (selected: boolean): React.CSSProperties => ({
	display: "flex",
	alignItems: "center",
	gap: 4,
	padding: "2px 4px",
	borderRadius: 4,
	cursor: "pointer",
	background: selected ? "var(--accent)" : "transparent",
	color: selected ? "#fff" : "var(--text)",
	fontSize: 13,
	userSelect: "none",
});

export function WorkGroupTree({ workGroups }: Props) {
	const {
		selection,
		setSelection,
		addWorkGroup,
		addWork,
		addTrain,
		removeWorkGroup,
		removeWork,
		removeTrain,
	} = useEditorStore();
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);

	const toggle = (id: string) => {
		setExpanded((s) => {
			const n = new Set(s);
			if (n.has(id)) {
				n.delete(id);
			} else {
				n.add(id);
			}
			return n;
		});
	};

	const closeCtx = () => setCtxMenu(null);

	const handleCtx = (
		e: React.MouseEvent,
		type: ContextMenu["type"],
		id: string,
		parentIds: string[],
	) => {
		e.preventDefault();
		e.stopPropagation();
		setCtxMenu({ type, id, parentIds, x: e.clientX, y: e.clientY });
	};

	return (
		<div
			style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}
			onClick={closeCtx}
			onContextMenu={(e) => e.preventDefault()}
		>
			{/* ルートの追加ボタン */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 6,
				}}
			>
				<span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>仕業群</span>
				<button
					onClick={() => {
						const id = addWorkGroup();
						setExpanded((s) => new Set(s).add(id));
						setSelection({ workGroupId: id });
					}}
					style={{
						border: "none",
						background: "none",
						fontSize: 16,
						color: "var(--accent)",
						padding: "0 4px",
						cursor: "pointer",
					}}
					title="仕業群を追加"
				>
					+
				</button>
			</div>

			{workGroups.map((wg) => {
				const wgSelected = selection.workGroupId === wg.Id && !selection.workId;
				const wgExpanded = expanded.has(wg.Id!);
				return (
					<div key={wg.Id}>
						{/* WorkGroup行 */}
						<div
							style={{ display: "flex", alignItems: "center" }}
							onContextMenu={(e) => handleCtx(e, "workGroup", wg.Id!, [])}
						>
							<span
								onClick={() => toggle(wg.Id!)}
								style={{
									marginRight: 4,
									fontSize: 10,
									color: "var(--text-muted)",
									cursor: "pointer",
									minWidth: 10,
								}}
							>
								{wgExpanded ? "▼" : "▶"}
							</span>
							<div
								style={rowStyle(wgSelected)}
								onClick={() => setSelection({ workGroupId: wg.Id ?? undefined })}
							>
								<span>📁</span>
								<span style={{ fontWeight: 600 }}>{wg.Name}</span>
							</div>
						</div>

						{/* Works */}
						{wgExpanded &&
							wg.Works.map((w) => {
								const wSelected =
									selection.workGroupId === wg.Id &&
									selection.workId === w.Id &&
									!selection.trainId;
								const wExpanded = expanded.has(w.Id!);
								return (
									<div key={w.Id} style={{ paddingLeft: 20 }}>
										<div
											style={{ display: "flex", alignItems: "center" }}
											onContextMenu={(e) => handleCtx(e, "work", w.Id!, [wg.Id!])}
										>
											<span
												onClick={() => toggle(w.Id!)}
												style={{
													marginRight: 4,
													fontSize: 10,
													color: "var(--text-muted)",
													cursor: "pointer",
													minWidth: 10,
												}}
											>
												{wExpanded ? "▼" : "▶"}
											</span>
											<div
												style={rowStyle(wSelected)}
												onClick={() =>
													setSelection({
														workGroupId: wg.Id ?? undefined,
														workId: w.Id ?? undefined,
													})
												}
											>
												<span>📋</span>
												<span>{w.Name}</span>
											</div>
										</div>

										{/* Trains */}
										{wExpanded &&
											w.Trains.map((t) => {
												const tSelected =
													selection.workGroupId === wg.Id &&
													selection.workId === w.Id &&
													selection.trainId === t.Id;
												return (
													<div
														key={t.Id}
														style={{ paddingLeft: 20 }}
														onContextMenu={(e) => handleCtx(e, "train", t.Id!, [wg.Id!, w.Id!])}
													>
														<div
															style={rowStyle(tSelected)}
															onClick={() =>
																setSelection({
																	workGroupId: wg.Id ?? undefined,
																	workId: w.Id ?? undefined,
																	trainId: t.Id ?? undefined,
																})
															}
														>
															<span>🚃</span>
															<span>
																{t.TrainNumber}
																{t.Destination ? ` → ${t.Destination}` : ""}
															</span>
														</div>
													</div>
												);
											})}

										{/* Train追加ボタン */}
										{wExpanded && (
											<div style={{ paddingLeft: 20 }}>
												<button
													onClick={() => {
														const id = addTrain(wg.Id!, w.Id!);
														setSelection({
															workGroupId: wg.Id ?? undefined,
															workId: w.Id ?? undefined,
															trainId: id,
														});
													}}
													style={{
														border: "none",
														background: "none",
														fontSize: 12,
														color: "var(--accent)",
														cursor: "pointer",
														padding: "2px 4px",
													}}
												>
													+ 列車追加
												</button>
											</div>
										)}
									</div>
								);
							})}

						{/* Work追加ボタン */}
						{wgExpanded && (
							<div style={{ paddingLeft: 20 }}>
								<button
									onClick={() => {
										const id = addWork(wg.Id!);
										setExpanded((s) => new Set(s).add(id));
										setSelection({ workGroupId: wg.Id ?? undefined, workId: id });
									}}
									style={{
										border: "none",
										background: "none",
										fontSize: 12,
										color: "var(--accent)",
										cursor: "pointer",
										padding: "2px 4px",
									}}
								>
									+ 仕業追加
								</button>
							</div>
						)}
					</div>
				);
			})}

			{/* コンテキストメニュー */}
			{ctxMenu && (
				<div
					style={{
						position: "fixed",
						top: ctxMenu.y,
						left: ctxMenu.x,
						background: "var(--bg-panel)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
						zIndex: 1000,
						minWidth: 140,
					}}
				>
					{ctxMenu.type === "workGroup" && (
						<>
							<button
								style={menuItemStyle}
								onClick={() => {
									addWork(ctxMenu.id);
									closeCtx();
								}}
							>
								仕業を追加
							</button>
							<hr
								style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--border)" }}
							/>
							<button
								style={{ ...menuItemStyle, color: "var(--danger)" }}
								onClick={() => {
									removeWorkGroup(ctxMenu.id);
									setSelection({});
									closeCtx();
								}}
							>
								仕業群を削除
							</button>
						</>
					)}
					{ctxMenu.type === "work" && (
						<>
							<button
								style={menuItemStyle}
								onClick={() => {
									addTrain(ctxMenu.parentIds[0], ctxMenu.id);
									closeCtx();
								}}
							>
								列車を追加
							</button>
							<hr
								style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--border)" }}
							/>
							<button
								style={{ ...menuItemStyle, color: "var(--danger)" }}
								onClick={() => {
									removeWork(ctxMenu.parentIds[0], ctxMenu.id);
									setSelection({ workGroupId: ctxMenu.parentIds[0] });
									closeCtx();
								}}
							>
								仕業を削除
							</button>
						</>
					)}
					{ctxMenu.type === "train" && (
						<button
							style={{ ...menuItemStyle, color: "var(--danger)" }}
							onClick={() => {
								removeTrain(ctxMenu.parentIds[0], ctxMenu.parentIds[1], ctxMenu.id);
								setSelection({
									workGroupId: ctxMenu.parentIds[0],
									workId: ctxMenu.parentIds[1],
								});
								closeCtx();
							}}
						>
							列車を削除
						</button>
					)}
				</div>
			)}
		</div>
	);
}

const menuItemStyle: React.CSSProperties = {
	display: "block",
	width: "100%",
	textAlign: "left",
	border: "none",
	background: "none",
	padding: "8px 12px",
	fontSize: 13,
	cursor: "pointer",
};
