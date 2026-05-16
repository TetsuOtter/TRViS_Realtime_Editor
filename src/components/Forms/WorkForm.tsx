import { useEffect, useRef, useState } from "react";

import type { WorkData } from "../../types/trvis";
import {
	CONTENT_TYPE_OPTIONS,
	contentTypeFromFileName,
	fileToBase64,
	isLikelyBase64,
	type EnumOption,
} from "../../types/trvisEnums";
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

const buttonStyle: React.CSSProperties = {
	padding: "4px 10px",
	border: "1px solid var(--border)",
	borderRadius: 4,
	background: "var(--bg-panel)",
	fontSize: 12,
	cursor: "pointer",
	whiteSpace: "nowrap",
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

function NullableEnumSelect({
	value,
	options,
	onChange,
}: {
	value: number | null | undefined;
	options: EnumOption[];
	onChange: (v: number | null) => void;
}) {
	// 既知の選択肢に無い値でも往復させるため、その場限りの選択肢を足す。
	const hasUnknown = value != null && !options.some((o) => o.value === value);
	return (
		<select
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
			style={inputStyle}
		>
			<option value="">未設定</option>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
			{hasUnknown && <option value={value!}>{value}: (不明な値)</option>}
		</select>
	);
}

/**
 * 添付/横型時刻表コンテンツの編集欄。
 *
 * 大きな base64 (添付ファイル) を controlled な textarea に流すと描画/再レンダ
 * が極端に重くなり画面が固まるため、4096 文字以上かつ base64 らしい内容は
 * textarea を既定で描画せず、ユーザが明示的に開いたときだけ描画する。
 */
function ContentEditor({
	value,
	onChange,
	onPick,
	busy,
	collapseSignal,
}: {
	value: string | null | undefined;
	onChange: (v: string | null) => void;
	onPick: () => void;
	busy: boolean;
	/** ファイル添付の度に変化する値。表示状態を強制的に畳むために使う。 */
	collapseSignal: number;
}) {
	const [revealed, setRevealed] = useState(false);
	// 手入力では畳まず、ファイル添付 (= 巨大 base64 に置換) のときだけ畳む。
	useEffect(() => {
		setRevealed(false);
	}, [collapseSignal]);
	const v = value ?? "";
	const heavy = isLikelyBase64(v);
	const hideTextarea = heavy && !revealed;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
				<button
					type="button"
					onClick={onPick}
					disabled={busy}
					style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}
				>
					{busy ? "読み込み中…" : "ファイルを選択 (PDF/PNG/JPG → base64)"}
				</button>
				{heavy && (
					<button type="button" onClick={() => setRevealed((r) => !r)} style={buttonStyle}>
						{revealed ? "テキストを隠す" : "テキストを表示/編集"}
					</button>
				)}
				{v && (
					<button
						type="button"
						onClick={() => {
							onChange(null);
							setRevealed(false);
						}}
						style={buttonStyle}
					>
						クリア
					</button>
				)}
			</div>
			{hideTextarea ? (
				<div
					style={{
						...inputStyle,
						color: "var(--text-muted)",
						background: "var(--bg-panel)",
					}}
				>
					base64 データ ({v.length.toLocaleString()} 文字) — 描画が重いため既定で非表示。
					必要なら「テキストを表示/編集」で開けます。
				</div>
			) : (
				<textarea
					value={v}
					onChange={(e) => onChange(e.target.value || null)}
					style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
					placeholder="未設定 (Text/URI は直接入力、ファイルは上のボタンから添付)"
				/>
			)}
		</div>
	);
}

export function WorkForm({ workGroupId, work }: Props) {
	const updateWork = useEditorStore((s) => s.updateWork);
	const affixFileRef = useRef<HTMLInputElement>(null);
	const etrainFileRef = useRef<HTMLInputElement>(null);
	const [busyKind, setBusyKind] = useState<"affix" | "etrain" | null>(null);
	const [collapse, setCollapse] = useState({ affix: 0, etrain: 0 });

	const upd = (patch: Partial<WorkData>) => updateWork(workGroupId, work.Id!, patch);

	const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>, kind: "affix" | "etrain") => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setBusyKind(kind);
		try {
			const b64 = await fileToBase64(file);
			const ct = contentTypeFromFileName(file.name);
			if (kind === "affix") {
				upd({
					AffixContent: b64,
					...(ct != null ? { AffixContentType: ct } : {}),
				});
			} else {
				upd({
					ETrainTimetableContent: b64,
					HasETrainTimetable: true,
					...(ct != null ? { ETrainTimetableContentType: ct } : {}),
				});
			}
			setCollapse((c) => ({ ...c, [kind]: c[kind] + 1 }));
		} catch (err) {
			console.error("ファイル添付に失敗しました:", err);
			alert(`ファイル添付に失敗しました: ${err}`);
		} finally {
			setBusyKind(null);
		}
	};

	return (
		<div style={{ padding: "8px 12px" }}>
			<h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>仕業</h4>

			<input
				ref={affixFileRef}
				type="file"
				accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
				onChange={(e) => onPickFile(e, "affix")}
				style={{ display: "none" }}
			/>
			<input
				ref={etrainFileRef}
				type="file"
				accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
				onChange={(e) => onPickFile(e, "etrain")}
				style={{ display: "none" }}
			/>

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

			<Field label="施行日 (YYYY-MM-DD または 任意の文字列)">
				<input
					type="text"
					value={work.AffectDate ?? ""}
					onChange={(e) => upd({ AffectDate: e.target.value || null })}
					style={inputStyle}
					placeholder="2024-01-01 / 平日 / 土休日 など"
				/>
			</Field>

			<Field label="添付コンテンツタイプ (行路添付)">
				<NullableEnumSelect
					value={work.AffixContentType}
					options={CONTENT_TYPE_OPTIONS}
					onChange={(v) => upd({ AffixContentType: v })}
				/>
			</Field>

			<Field label="添付コンテンツ (行路添付)">
				<ContentEditor
					value={work.AffixContent}
					onChange={(v) => upd({ AffixContent: v })}
					onPick={() => affixFileRef.current?.click()}
					busy={busyKind === "affix"}
					collapseSignal={collapse.affix}
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

			<Field label="横向き時刻表あり">
				<NullableBoolean
					value={work.HasETrainTimetable}
					onChange={(v) => upd({ HasETrainTimetable: v })}
				/>
			</Field>

			<Field label="横向き時刻表コンテンツタイプ">
				<NullableEnumSelect
					value={work.ETrainTimetableContentType}
					options={CONTENT_TYPE_OPTIONS}
					onChange={(v) => upd({ ETrainTimetableContentType: v })}
				/>
			</Field>

			<Field label="横向き時刻表コンテンツ">
				<ContentEditor
					value={work.ETrainTimetableContent}
					onChange={(v) => upd({ ETrainTimetableContent: v })}
					onPick={() => etrainFileRef.current?.click()}
					busy={busyKind === "etrain"}
					collapseSignal={collapse.etrain}
				/>
			</Field>
		</div>
	);
}
