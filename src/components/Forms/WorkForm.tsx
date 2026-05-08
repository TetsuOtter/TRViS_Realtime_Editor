import type { WorkData } from "../../types/trvis";
import { useEditorStore } from "../../store/editorStore";

interface Props {
	workGroupId: string;
	work: WorkData;
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

export function WorkForm({ workGroupId, work }: Props) {
	const updateWork = useEditorStore((s) => s.updateWork);

	const upd = (patch: Partial<WorkData>) => updateWork(workGroupId, work.Id!, patch);

	return (
		<div style={{ padding: "8px 12px" }}>
			<h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>仕業</h4>

			<Field label="Id (読み取り専用)">
				<input value={work.Id ?? ""} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
			</Field>

			<Field label="名前 *">
				<input
					value={work.Name}
					onChange={(e) => upd({ Name: e.target.value })}
					style={inputStyle}
				/>
			</Field>

			<Field label="適用日 (YYYY-MM-DD)">
				<input
					type="date"
					value={work.AffectDate ?? ""}
					onChange={(e) => upd({ AffectDate: e.target.value || null })}
					style={inputStyle}
				/>
			</Field>

			<Field label="添付コンテンツタイプ">
				<input
					type="number"
					value={work.AffixContentType ?? ""}
					onChange={(e) =>
						upd({ AffixContentType: e.target.value === "" ? null : Number(e.target.value) })
					}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="添付コンテンツ">
				<textarea
					value={work.AffixContent ?? ""}
					onChange={(e) => upd({ AffixContent: e.target.value || null })}
					style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
					placeholder="未設定"
				/>
			</Field>

			<Field label="備考">
				<textarea
					value={work.Remarks ?? ""}
					onChange={(e) => upd({ Remarks: e.target.value || null })}
					style={{ ...inputStyle, minHeight: 48, resize: "vertical" }}
					placeholder="未設定"
				/>
			</Field>

			<Field label="電子時刻表あり">
				<NullableBoolean
					value={work.HasETrainTimetable}
					onChange={(v) => upd({ HasETrainTimetable: v })}
				/>
			</Field>

			<Field label="電子時刻表コンテンツタイプ">
				<input
					type="number"
					value={work.ETrainTimetableContentType ?? ""}
					onChange={(e) =>
						upd({
							ETrainTimetableContentType: e.target.value === "" ? null : Number(e.target.value),
						})
					}
					style={inputStyle}
					placeholder="未設定"
				/>
			</Field>

			<Field label="電子時刻表コンテンツ">
				<textarea
					value={work.ETrainTimetableContent ?? ""}
					onChange={(e) => upd({ ETrainTimetableContent: e.target.value || null })}
					style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
					placeholder="未設定"
				/>
			</Field>
		</div>
	);
}
