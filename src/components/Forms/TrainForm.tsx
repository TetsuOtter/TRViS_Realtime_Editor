import type { TrainData } from "../../types/trvis";
import { useEditorStore } from "../../store/editorStore";

interface Props {
	workGroupId: string;
	workId: string;
	train: TrainData;
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

export function TrainForm({ workGroupId, workId, train }: Props) {
	const updateTrain = useEditorStore((s) => s.updateTrain);

	const upd = (patch: Partial<TrainData>) => updateTrain(workGroupId, workId, train.Id!, patch);

	return (
		<div style={{ padding: "8px 12px" }}>
			<h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>列車</h4>

			<Field label="Id (読み取り専用)">
				<input value={train.Id ?? ""} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
			</Field>

			<Field label="列車番号 *">
				<input
					value={train.TrainNumber}
					onChange={(e) => upd({ TrainNumber: e.target.value })}
					style={inputStyle}
				/>
			</Field>

			<Field label="最高速度">
				<input
					value={train.MaxSpeed ?? ""}
					onChange={(e) => upd({ MaxSpeed: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="速度種別">
				<input
					value={train.SpeedType ?? ""}
					onChange={(e) => upd({ SpeedType: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="名義牽引力">
				<input
					value={train.NominalTractiveCapacity ?? ""}
					onChange={(e) => upd({ NominalTractiveCapacity: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="車両数">
				<input
					type="number"
					value={train.CarCount ?? ""}
					onChange={(e) => upd({ CarCount: e.target.value === "" ? null : Number(e.target.value) })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="行先">
				<input
					value={train.Destination ?? ""}
					onChange={(e) => upd({ Destination: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="始業備考">
				<input
					value={train.BeginRemarks ?? ""}
					onChange={(e) => upd({ BeginRemarks: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="終業備考">
				<input
					value={train.AfterRemarks ?? ""}
					onChange={(e) => upd({ AfterRemarks: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="備考">
				<input
					value={train.Remarks ?? ""}
					onChange={(e) => upd({ Remarks: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="出発前">
				<input
					value={train.BeforeDeparture ?? ""}
					onChange={(e) => upd({ BeforeDeparture: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="列車情報">
				<input
					value={train.TrainInfo ?? ""}
					onChange={(e) => upd({ TrainInfo: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="方向 * (0=下り, 1=上り)">
				<input
					type="number"
					value={train.Direction}
					onChange={(e) => upd({ Direction: Number(e.target.value) })}
					style={inputStyle}
					min={0}
					max={1}
				/>
			</Field>

			<Field label="仕業種別">
				<input
					type="number"
					value={train.WorkType ?? ""}
					onChange={(e) => upd({ WorkType: e.target.value === "" ? null : Number(e.target.value) })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="到着後">
				<input
					value={train.AfterArrive ?? ""}
					onChange={(e) => upd({ AfterArrive: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="出発前(番線列)">
				<input
					value={train.BeforeDeparture_OnStationTrackCol ?? ""}
					onChange={(e) => upd({ BeforeDeparture_OnStationTrackCol: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="到着後(番線列)">
				<input
					value={train.AfterArrive_OnStationTrackCol ?? ""}
					onChange={(e) => upd({ AfterArrive_OnStationTrackCol: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="日数カウント">
				<input
					type="number"
					value={train.DayCount ?? ""}
					onChange={(e) => upd({ DayCount: e.target.value === "" ? null : Number(e.target.value) })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="移動中乗車">
				<NullableBoolean
					value={train.IsRideOnMoving}
					onChange={(v) => upd({ IsRideOnMoving: v })}
				/>
			</Field>

			<Field label="色 (#RRGGBB)">
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<input
						value={train.Color ?? ""}
						onChange={(e) => upd({ Color: e.target.value || null })}
						style={{ ...inputStyle, flex: 1 }}
						placeholder="未設定 例: #ff0000"
					/>
					<input
						type="color"
						value={train.Color ?? "#000000"}
						onChange={(e) => upd({ Color: e.target.value })}
						style={{
							width: 36,
							height: 28,
							padding: 2,
							border: "1px solid var(--border)",
							borderRadius: 4,
						}}
					/>
				</div>
			</Field>

			<Field label="次列車ID">
				<input
					value={train.NextTrainId ?? ""}
					onChange={(e) => upd({ NextTrainId: e.target.value || null })}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>
		</div>
	);
}
