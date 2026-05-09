import type { TrainData } from "../types/trvis";
import { useEditorStore } from "../store/editorStore";

interface Props {
	workGroupId: string;
	workId: string;
	train: TrainData;
	selectedRowId: string | null;
	onSelectRow: (id: string | null) => void;
	onEditRowDetail: (rowId: string) => void;
	onOpenLocationMap: () => void;
}

export function TimetableTable({
	workGroupId,
	workId,
	train,
	selectedRowId,
	onSelectRow,
	onEditRowDetail,
	onOpenLocationMap,
}: Props) {
	const { addTimetableRow, removeTimetableRow, moveTimetableRow, updateTimetableRow } =
		useEditorStore();

	const rows = train.TimetableRows;

	const thStyle: React.CSSProperties = {
		padding: "4px 6px",
		fontSize: 11,
		fontWeight: 600,
		color: "var(--text-muted)",
		textAlign: "left",
		whiteSpace: "nowrap",
		borderBottom: "1px solid var(--border)",
		background: "var(--bg-panel)",
		position: "sticky",
		top: 0,
	};

	const tdStyle = (selected: boolean): React.CSSProperties => ({
		padding: "3px 6px",
		fontSize: 12,
		borderBottom: "1px solid var(--border)",
		background: selected ? "rgba(0,113,227,0.08)" : "transparent",
		cursor: "pointer",
		whiteSpace: "nowrap",
	});

	const inlineInput = (
		value: string | number | null | undefined,
		onChange: (v: string) => void,
		width?: number,
		extraProps?: React.InputHTMLAttributes<HTMLInputElement>,
	) => (
		<input
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value)}
			onClick={(e) => e.stopPropagation()}
			style={{
				width: width ?? 80,
				padding: "1px 4px",
				border: "1px solid var(--border)",
				borderRadius: 3,
				fontSize: 12,
				background: "var(--bg)",
			}}
			{...extraProps}
		/>
	);

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<div
				style={{
					padding: "4px 8px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					borderBottom: "1px solid var(--border)",
					background: "var(--bg-panel)",
				}}
			>
				<span style={{ fontSize: 13, fontWeight: 600 }}>
					{train.TrainNumber}
					{train.Destination ? ` → ${train.Destination}` : ""} ({rows.length}行)
				</span>
				<div style={{ display: "flex", gap: 6 }}>
					<button
						onClick={onOpenLocationMap}
						style={{
							padding: "3px 10px",
							fontSize: 12,
							border: "1px solid var(--border)",
							borderRadius: 4,
							background: "var(--bg)",
							color: "var(--text)",
							cursor: "pointer",
						}}
						title="位置情報・地図を編集"
					>
						📍 位置情報・地図
					</button>
					<button
						onClick={() => {
							const id = addTimetableRow(workGroupId, workId, train.Id!);
							onSelectRow(id);
						}}
						style={{
							padding: "3px 10px",
							fontSize: 12,
							border: "none",
							borderRadius: 4,
							background: "var(--accent)",
							color: "#fff",
							cursor: "pointer",
						}}
					>
						+ 行追加
					</button>
				</div>
			</div>

			<div style={{ flex: 1, overflowY: "auto" }}>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							<th style={thStyle}>#</th>
							<th style={thStyle}>駅名</th>
							<th style={thStyle}>走行(分)</th>
							<th style={thStyle}>走行(秒)</th>
							<th style={thStyle}>着</th>
							<th style={thStyle}>発</th>
							<th style={thStyle}>番線</th>
							<th style={thStyle}>操作</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row, idx) => {
							const sel = row.Id === selectedRowId;
							return (
								<tr key={row.Id} onClick={() => onSelectRow(sel ? null : (row.Id ?? null))}>
									<td style={tdStyle(sel)}>{idx + 1}</td>
									<td style={tdStyle(sel)}>
										{inlineInput(
											row.StationName,
											(v) =>
												updateTimetableRow(workGroupId, workId, train.Id!, row.Id!, {
													StationName: v,
												}),
											100,
										)}
									</td>
									<td style={tdStyle(sel)}>
										{inlineInput(
											row.DriveTime_MM,
											(v) =>
												updateTimetableRow(workGroupId, workId, train.Id!, row.Id!, {
													DriveTime_MM: v === "" ? null : Number(v),
												}),
											50,
											{ type: "number", min: 0 },
										)}
									</td>
									<td style={tdStyle(sel)}>
										{inlineInput(
											row.DriveTime_SS,
											(v) =>
												updateTimetableRow(workGroupId, workId, train.Id!, row.Id!, {
													DriveTime_SS: v === "" ? null : Number(v),
												}),
											50,
											{ type: "number", min: 0, max: 59 },
										)}
									</td>
									<td style={tdStyle(sel)}>
										{inlineInput(
											row.Arrive,
											(v) =>
												updateTimetableRow(workGroupId, workId, train.Id!, row.Id!, {
													Arrive: v || null,
												}),
											70,
										)}
									</td>
									<td style={tdStyle(sel)}>
										{inlineInput(
											row.Departure,
											(v) =>
												updateTimetableRow(workGroupId, workId, train.Id!, row.Id!, {
													Departure: v || null,
												}),
											70,
										)}
									</td>
									<td style={tdStyle(sel)}>
										{inlineInput(
											row.TrackName,
											(v) =>
												updateTimetableRow(workGroupId, workId, train.Id!, row.Id!, {
													TrackName: v || null,
												}),
											60,
										)}
									</td>
									<td style={tdStyle(sel)}>
										<div style={{ display: "flex", gap: 4 }}>
											<button
												onClick={(e) => {
													e.stopPropagation();
													onSelectRow(row.Id ?? null);
													onEditRowDetail(row.Id!);
												}}
												style={{
													border: "none",
													background: "none",
													cursor: "pointer",
													padding: 2,
													color: "var(--accent)",
												}}
												title="詳細を編集"
											>
												⚙
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													moveTimetableRow(
														workGroupId,
														workId,
														train.Id!,
														row.Id!,
														Math.max(0, idx - 1),
													);
												}}
												disabled={idx === 0}
												style={{
													border: "none",
													background: "none",
													cursor: "pointer",
													padding: 2,
													opacity: idx === 0 ? 0.3 : 1,
												}}
												title="上に移動"
											>
												↑
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													moveTimetableRow(
														workGroupId,
														workId,
														train.Id!,
														row.Id!,
														Math.min(rows.length - 1, idx + 1),
													);
												}}
												disabled={idx === rows.length - 1}
												style={{
													border: "none",
													background: "none",
													cursor: "pointer",
													padding: 2,
													opacity: idx === rows.length - 1 ? 0.3 : 1,
												}}
												title="下に移動"
											>
												↓
											</button>
											<button
												onClick={(e) => {
													e.stopPropagation();
													if (selectedRowId === row.Id) onSelectRow(null);
													removeTimetableRow(workGroupId, workId, train.Id!, row.Id!);
												}}
												style={{
													border: "none",
													background: "none",
													cursor: "pointer",
													padding: 2,
													color: "var(--danger)",
												}}
												title="削除"
											>
												✕
											</button>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
