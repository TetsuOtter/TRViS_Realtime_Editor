import type { WorkGroupData } from "../../types/trvis";
import { useEditorStore } from "../../store/editorStore";

interface Props {
	workGroup: WorkGroupData;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
			<label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{label}</label>
			{children}
		</div>
	);
}

export function WorkGroupForm({ workGroup }: Props) {
	const updateWorkGroup = useEditorStore((s) => s.updateWorkGroup);

	const s: React.CSSProperties = {
		padding: "4px 8px",
		border: "1px solid var(--border)",
		borderRadius: 4,
		background: "var(--bg)",
		fontSize: 13,
		width: "100%",
	};

	return (
		<div style={{ padding: "8px 12px" }}>
			<h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>仕業群</h4>

			<Field label="Id (UUID, 読み取り専用)">
				<input value={workGroup.Id ?? ""} readOnly style={{ ...s, opacity: 0.6 }} />
			</Field>

			<Field label="名前 *">
				<input
					value={workGroup.Name}
					onChange={(e) => updateWorkGroup(workGroup.Id!, { Name: e.target.value })}
					style={s}
				/>
			</Field>

			<Field label="DBバージョン">
				<input
					type="number"
					value={workGroup.DBVersion ?? ""}
					onChange={(e) => {
						const v = e.target.value === "" ? null : Number(e.target.value);
						updateWorkGroup(workGroup.Id!, { DBVersion: v });
					}}
					style={s}
					placeholder="未設定"
				/>
			</Field>
		</div>
	);
}
