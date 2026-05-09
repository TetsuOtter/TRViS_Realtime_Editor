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

const textareaStyle: React.CSSProperties = {
	...inputStyle,
	minHeight: 48,
	resize: "vertical",
	fontFamily: "inherit",
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

/**
 * 方向 (Direction) は正の数=下り / 負の数=上り。
 * 値が ±1 のときは下り/上りラジオで、それ以外の値が入っているときのみ数値入力にする。
 */
function DirectionInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
	const isStandard = value === 1 || value === -1;

	if (isStandard) {
		return (
			<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
					<input type="radio" name="direction" checked={value === 1} onChange={() => onChange(1)} />
					下り (1)
				</label>
				<label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
					<input
						type="radio"
						name="direction"
						checked={value === -1}
						onChange={() => onChange(-1)}
					/>
					上り (-1)
				</label>
				<button
					type="button"
					onClick={() => onChange(0)}
					style={{
						padding: "2px 8px",
						fontSize: 11,
						border: "1px solid var(--border)",
						borderRadius: 4,
						background: "var(--bg)",
						color: "var(--text-muted)",
						cursor: "pointer",
					}}
					title="±1以外の数値を指定"
				>
					数値で指定…
				</button>
			</div>
		);
	}

	return (
		<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
			<input
				type="number"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				style={{ ...inputStyle, flex: 1 }}
			/>
			<button
				type="button"
				onClick={() => onChange(value >= 0 ? 1 : -1)}
				style={{
					padding: "2px 8px",
					fontSize: 11,
					border: "1px solid var(--border)",
					borderRadius: 4,
					background: "var(--bg)",
					color: "var(--text-muted)",
					cursor: "pointer",
					whiteSpace: "nowrap",
				}}
				title="標準値 (±1) に戻す"
			>
				下り/上り
			</button>
		</div>
	);
}

export function TrainForm({ workGroupId, workId, train }: Props) {
	const updateTrain = useEditorStore((s) => s.updateTrain);
	const workGroup = useEditorStore((s) => s.workGroups.find((wg) => wg.Id === workGroupId));

	const upd = (patch: Partial<TrainData>) => updateTrain(workGroupId, workId, train.Id!, patch);

	const nextTrainCandidates: { workName: string; trains: TrainData[] }[] =
		workGroup?.Works.map((w) => ({
			workName: w.Name,
			trains: w.Trains.filter((t) => t.Id !== train.Id),
		})).filter((g) => g.trains.length > 0) ?? [];

	const currentNextTrainId = train.NextTrainId ?? "";
	const knownTrainIds = new Set(nextTrainCandidates.flatMap((g) => g.trains.map((t) => t.Id!)));
	const isCustom = currentNextTrainId !== "" && !knownTrainIds.has(currentNextTrainId);

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

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(3, 1fr)",
					gap: 8,
					marginBottom: 8,
				}}
			>
				<Field label="最高速度">
					<textarea
						value={train.MaxSpeed ?? ""}
						onChange={(e) => upd({ MaxSpeed: e.target.value || null })}
						style={textareaStyle}
						placeholder="未設定"
					/>
				</Field>
				<Field label="速度種別">
					<textarea
						value={train.SpeedType ?? ""}
						onChange={(e) => upd({ SpeedType: e.target.value || null })}
						style={textareaStyle}
						placeholder="未設定"
					/>
				</Field>
				<Field label="けん引定数">
					<textarea
						value={train.NominalTractiveCapacity ?? ""}
						onChange={(e) => upd({ NominalTractiveCapacity: e.target.value || null })}
						style={textareaStyle}
						placeholder="未設定"
					/>
				</Field>
			</div>

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
				<textarea
					value={train.BeginRemarks ?? ""}
					onChange={(e) => upd({ BeginRemarks: e.target.value || null })}
					style={textareaStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="終業備考">
				<textarea
					value={train.AfterRemarks ?? ""}
					onChange={(e) => upd({ AfterRemarks: e.target.value || null })}
					style={textareaStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="備考">
				<textarea
					value={train.Remarks ?? ""}
					onChange={(e) => upd({ Remarks: e.target.value || null })}
					style={textareaStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="発前">
				<textarea
					value={train.BeforeDeparture ?? ""}
					onChange={(e) => upd({ BeforeDeparture: e.target.value || null })}
					style={textareaStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="列車情報">
				<textarea
					value={train.TrainInfo ?? ""}
					onChange={(e) => upd({ TrainInfo: e.target.value || null })}
					style={textareaStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="方向 * (正=下り / 負=上り)">
				<DirectionInput value={train.Direction} onChange={(v) => upd({ Direction: v })} />
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

			<Field label="着後">
				<textarea
					value={train.AfterArrive ?? ""}
					onChange={(e) => upd({ AfterArrive: e.target.value || null })}
					style={textareaStyle}
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
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<input
						value={currentNextTrainId}
						onChange={(e) => upd({ NextTrainId: e.target.value || null })}
						style={{ ...inputStyle, flex: 1 }}
						placeholder="未設定"
					/>
					<select
						value={isCustom ? "__custom__" : currentNextTrainId}
						onChange={(e) => {
							if (e.target.value === "__custom__") return;
							upd({ NextTrainId: e.target.value || null });
						}}
						style={{ ...inputStyle, flex: 1, minWidth: 0 }}
						title="同じ仕業群内の列車から選択"
					>
						<option value="">未設定</option>
						{isCustom && (
							<option value="__custom__" disabled>
								(カスタム: {currentNextTrainId})
							</option>
						)}
						{nextTrainCandidates.map((g) => (
							<optgroup key={g.workName} label={g.workName}>
								{g.trains.map((t) => (
									<option key={t.Id} value={t.Id!}>
										{t.TrainNumber}
										{t.Destination ? ` → ${t.Destination}` : ""}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</div>
			</Field>
		</div>
	);
}
