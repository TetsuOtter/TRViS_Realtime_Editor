import { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { WorkGroupData } from "../../types/trvis";

interface Props {
	workGroups: WorkGroupData[];
	onEditWorkGroup?: (workGroupId: string) => void;
	onEditWork?: (workGroupId: string, workId: string) => void;
	onEditTrain?: (workGroupId: string, workId: string, trainId: string) => void;
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
	flex: 1,
	minWidth: 0,
	overflow: "hidden",
});

const labelTextStyle: React.CSSProperties = {
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
};

const gearBtnStyle = (selected: boolean): React.CSSProperties => ({
	border: "none",
	background: "none",
	cursor: "pointer",
	padding: "2px 4px",
	fontSize: 14,
	lineHeight: 1,
	color: selected ? "#fff" : "var(--text-muted)",
	opacity: selected ? 1 : 0.7,
	flex: "none",
});

export function WorkGroupTree({ workGroups, onEditWorkGroup, onEditWork, onEditTrain }: Props) {
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
							style={{ display: "flex", alignItems: "center", minWidth: 0 }}
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
									flex: "none",
								}}
							>
								{wgExpanded ? "▼" : "▶"}
							</span>
							<div
								style={rowStyle(wgSelected)}
								onClick={() => setSelection({ workGroupId: wg.Id ?? undefined })}
							>
								<span style={{ flex: "none" }}>📁</span>
								<span style={{ ...labelTextStyle, fontWeight: 600, flex: 1 }}>{wg.Name}</span>
								{onEditWorkGroup && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onEditWorkGroup(wg.Id!);
										}}
										title="仕業群を編集"
										style={gearBtnStyle(wgSelected)}
									>
										⚙
									</button>
								)}
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
											style={{ display: "flex", alignItems: "center", minWidth: 0 }}
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
													flex: "none",
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
												<span style={{ flex: "none" }}>📋</span>
												<span style={{ ...labelTextStyle, flex: 1 }}>{w.Name}</span>
												{onEditWork && (
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															onEditWork(wg.Id!, w.Id!);
														}}
														title="仕業を編集"
														style={gearBtnStyle(wSelected)}
													>
														⚙
													</button>
												)}
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
														style={{
															paddingLeft: 20,
															display: "flex",
															alignItems: "center",
															minWidth: 0,
														}}
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
															<span style={{ flex: "none" }}>🚃</span>
															<span style={{ ...labelTextStyle, flex: 1 }}>
																{t.TrainNumber}
																{t.Destination ? ` → ${t.Destination}` : ""}
															</span>
															{onEditTrain && (
																<button
																	type="button"
																	onClick={(e) => {
																		e.stopPropagation();
																		onEditTrain(wg.Id!, w.Id!, t.Id!);
																	}}
																	title="列車を編集"
																	style={gearBtnStyle(tSelected)}
																>
																	⚙
																</button>
															)}
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
							{onEditWorkGroup && (
								<button
									style={menuItemStyle}
									onClick={() => {
										onEditWorkGroup(ctxMenu.id);
										closeCtx();
									}}
								>
									仕業群を編集...
								</button>
							)}
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
							{onEditWork && (
								<button
									style={menuItemStyle}
									onClick={() => {
										onEditWork(ctxMenu.parentIds[0], ctxMenu.id);
										closeCtx();
									}}
								>
									仕業を編集...
								</button>
							)}
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
						<>
							{onEditTrain && (
								<button
									style={menuItemStyle}
									onClick={() => {
										onEditTrain(ctxMenu.parentIds[0], ctxMenu.parentIds[1], ctxMenu.id);
										closeCtx();
									}}
								>
									列車を編集...
								</button>
							)}
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
						</>
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
