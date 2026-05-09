import type { TimetableRowData } from "../../types/trvis";
import { useEditorStore } from "../../store/editorStore";

interface Props {
	workGroupId: string;
	workId: string;
	trainId: string;
	row: TimetableRowData;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
			<label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{label}</label>
			{children}
		</div>
	);
}

const inputStyle: React.CSSProperties = {
	padding: "4px 8px",
	border: "1px solid var(--border)",
	borderRadius: 4,
	background: "var(--bg)",
	fontSize: 13,
	width: "100%",
};

function NullableBoolean({
	value,
	onChange,
}: {
	value: boolean | null | undefined;
	onChange: (v: boolean | null) => void;
}) {
	const strVal = value === true ? "true" : value === false ? "false" : "";
	return (
		<select
			value={strVal}
			onChange={(e) => {
				if (e.target.value === "") onChange(null);
				else onChange(e.target.value === "true");
			}}
			style={inputStyle}
		>
			<option value="">未設定</option>
			<option value="true">はい</option>
			<option value="false">いいえ</option>
		</select>
	);
}

export function TimetableRowForm({ workGroupId, workId, trainId, row }: Props) {
	const updateTimetableRow = useEditorStore((s) => s.updateTimetableRow);

	const upd = (patch: Partial<TimetableRowData>) =>
		updateTimetableRow(workGroupId, workId, trainId, row.Id!, patch);

	return (
		<div style={{ padding: "8px 12px" }}>
			<h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>時刻表行</h4>

			<Field label="Id (読み取り専用)">
				<input value={row.Id ?? ""} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
			</Field>

			<Field label="駅名 *">
				<input
					value={row.StationName}
					onChange={(e) => upd({ StationName: e.target.value })}
					style={inputStyle}
				/>
			</Field>

			<Field label="距離 (m) *">
				<input
					type="number"
					value={row.Location_m}
					onChange={(e) => upd({ Location_m: Number(e.target.value) })}
					style={inputStyle}
					step="0.1"
				/>
			</Field>

			<Field label="経度 (deg)">
				<input
					type="number"
					value={row.Longitude_deg ?? ""}
					onChange={(e) =>
						upd({ Longitude_deg: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					step="0.000001"
				/>
			</Field>

			<Field label="緯度 (deg)">
				<input
					type="number"
					value={row.Latitude_deg ?? ""}
					onChange={(e) =>
						upd({ Latitude_deg: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					step="0.000001"
				/>
			</Field>

			<Field label="駅検出半径 (m)">
				<input
					type="number"
					value={row.OnStationDetectRadius_m ?? ""}
					onChange={(e) =>
						upd({ OnStationDetectRadius_m: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					step="1"
					min="0"
				/>
			</Field>

			<Field label="フルネーム">
				<input
					value={row.FullName ?? ""}
					onChange={(e) => upd({ FullName: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="レコード種別">
				<input
					type="number"
					value={row.RecordType ?? ""}
					onChange={(e) =>
						upd({ RecordType: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="番線名">
				<input
					value={row.TrackName ?? ""}
					onChange={(e) => upd({ TrackName: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="走行時分(分)">
				<input
					type="number"
					value={row.DriveTime_MM ?? ""}
					onChange={(e) =>
						upd({ DriveTime_MM: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					min="0"
				/>
			</Field>

			<Field label="走行時分(秒)">
				<input
					type="number"
					value={row.DriveTime_SS ?? ""}
					onChange={(e) =>
						upd({ DriveTime_SS: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					min="0"
					max="59"
				/>
			</Field>

			<Field label="運転停車">
				<NullableBoolean
					value={row.IsOperationOnlyStop}
					onChange={(v) => upd({ IsOperationOnlyStop: v })}
				/>
			</Field>

			<Field label="通過">
				<NullableBoolean value={row.IsPass} onChange={(v) => upd({ IsPass: v })} />
			</Field>

			<Field label="括弧あり">
				<NullableBoolean value={row.HasBracket} onChange={(v) => upd({ HasBracket: v })} />
			</Field>

			<Field label="最終停車">
				<NullableBoolean value={row.IsLastStop} onChange={(v) => upd({ IsLastStop: v })} />
			</Field>

			<Field label="着時刻 (HH:MM:SS)">
				<input
					value={row.Arrive ?? ""}
					onChange={(e) => upd({ Arrive: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定 例: 10:00:00"
				/>
			</Field>

			<Field label="発時刻 (HH:MM:SS)">
				<input
					value={row.Departure ?? ""}
					onChange={(e) => upd({ Departure: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定 例: 10:02:00"
				/>
			</Field>

			<Field label="進入制限速度">
				<input
					type="number"
					value={row.RunInLimit ?? ""}
					onChange={(e) =>
						upd({ RunInLimit: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					min="0"
				/>
			</Field>

			<Field label="進出制限速度">
				<input
					type="number"
					value={row.RunOutLimit ?? ""}
					onChange={(e) =>
						upd({ RunOutLimit: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
					min="0"
				/>
			</Field>

			<Field label="備考">
				<input
					value={row.Remarks ?? ""}
					onChange={(e) => upd({ Remarks: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="マーカー色 (#RRGGBB)">
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<input
						value={row.MarkerColor ?? ""}
						onChange={(e) => upd({ MarkerColor: e.target.value || null })}
						style={{ ...inputStyle, flex: 1 }}
						placeholder="未設定"
					/>
					{row.MarkerColor && (
						<input
							type="color"
							value={row.MarkerColor ?? "#000000"}
							onChange={(e) => upd({ MarkerColor: e.target.value })}
							style={{
								width: 36,
								height: 28,
								padding: 2,
								border: "1px solid var(--border)",
								borderRadius: 4,
							}}
						/>
					)}
				</div>
			</Field>

			<Field label="マーカーテキスト">
				<input
					value={row.MarkerText ?? ""}
					onChange={(e) => upd({ MarkerText: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="仕業種別">
				<input
					type="number"
					value={row.WorkType ?? ""}
					onChange={(e) => upd({ WorkType: e.target.value === "" ? null : Number(e.target.value) })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>
		</div>
	);
}
