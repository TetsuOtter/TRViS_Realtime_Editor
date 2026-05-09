import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "../components/Dialog";
import { JsonEditor, type JsonEditorHandle } from "./JsonEditor";
import { tryParseDocument, validateAgainstSchema, type ParseError } from "./parseDocument";
import { workGroupArraySchema, workGroupDocumentSchema } from "./schema";
import { useEditorStore } from "../store/editorStore";

export type JsonEditDialogMode = "edit" | "fix-load";

interface Props {
	open: boolean;
	mode: JsonEditDialogMode;
	/** 初期テキスト。`mode==="edit"` なら現データの整形済み JSON、`mode==="fix-load"` ならロードに失敗した生テキスト。 */
	initialText: string;
	/** mode==="fix-load" のときに表示する初期エラーメッセージ (一覧)。 */
	initialErrors?: ParseError[];
	onClose: () => void;
}

/**
 * JSON を直接編集するためのダイアログ。
 *   - `mode === "edit"` : 適用時は `replaceDocument` (履歴・選択を保持)
 *   - `mode === "fix-load"` : 適用時は `loadDocument` (まっさらロード扱い)
 *
 * 「適用」ボタンを押すと `tryParseDocument` でパースを試み、失敗時はエラーを表示し
 * ダイアログを閉じない。成功時はストアを更新して閉じる。
 */
export function JsonEditDialog({ open, mode, initialText, initialErrors, onClose }: Props) {
	const loadDocument = useEditorStore((s) => s.loadDocument);
	const replaceDocument = useEditorStore((s) => s.replaceDocument);

	const [text, setText] = useState(initialText);
	const [errors, setErrors] = useState<ParseError[]>(initialErrors ?? []);
	// fix-load モードでは初回 apply で `loadDocument` (まっさらロード) を行うが、
	// 連続して apply された場合は既にロード済みなので edit 同様に `replaceDocument` に切り替える。
	const [appliedOnce, setAppliedOnce] = useState(false);
	/**
	 * 「最後に適用済み」のテキスト。`text` と異なれば未適用 (dirty)。
	 *   - edit モード: 開いた時点はストア = initialText なので `initialText` を初期値にする。
	 *   - fix-load モード: 開いた時点では「失敗した生 JSON」がストアに反映されていない →
	 *     `null` にして「常に未適用」状態でスタート。
	 */
	const [lastAppliedText, setLastAppliedText] = useState<string | null>(initialText);

	// open / initialText が変わったタイミングでローカル state を初期化する
	useEffect(() => {
		if (!open) return;
		setText(initialText);
		setErrors(initialErrors ?? []);
		setAppliedOnce(false);
		setLastAppliedText(mode === "edit" ? initialText : null);
	}, [open, initialText, initialErrors, mode]);

	const isDirty = lastAppliedText === null || lastAppliedText !== text;

	const baseTitle = mode === "fix-load" ? "JSON 読み込みエラーを修正" : "JSON を直接編集";
	// 未適用なら題名にも `*` を付けて一目でわかるようにする (一般的な編集アプリ流儀)。
	const title = isDirty ? `${baseTitle} *` : baseTitle;

	const apply = () => {
		const r = tryParseDocument(text);
		if (!r.ok) {
			setErrors(r.errors);
			return;
		}
		// 構文 OK の後でスキーマ検証 (複数エラーをすべて拾う)
		const schemaErrors = validateAgainstSchema(r.data, workGroupArraySchema);
		if (schemaErrors.length > 0) {
			setErrors(schemaErrors);
			return;
		}
		setErrors([]);
		if (mode === "fix-load" && !appliedOnce) {
			loadDocument(r.data);
		} else {
			replaceDocument(r.data);
		}
		setAppliedOnce(true);
		setLastAppliedText(text);
		// ダイアログは閉じない (適用後も継続編集できるようにする)
	};

	// 最新の apply / open を keydown listener から参照するための ref。
	const applyRef = useRef(apply);
	useEffect(() => {
		applyRef.current = apply;
	});

	// Cmd/Ctrl + S で適用する。エディタにフォーカスがあってもボタンにあっても効くよう
	// window レベルで拾う。ブラウザ既定のページ保存ダイアログは preventDefault で抑止。
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "s") {
				e.preventDefault();
				applyRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	const handleFormat = () => {
		try {
			const parsed = JSON.parse(text);
			setText(JSON.stringify(parsed, null, 2));
			setErrors([]);
		} catch {
			// JSON.parse が落ちる時点で構文不正なので、jsonc-parser 経由で全件のエラーを出す
			const r = tryParseDocument(text);
			if (!r.ok) setErrors(r.errors);
		}
	};

	// schema は安定参照を使う (JsonEditor 側で依存に入っているため)
	const schema = useMemo(() => workGroupDocumentSchema, []);

	// エラー一覧クリックでエディタの該当位置にジャンプするための ref
	const editorRef = useRef<JsonEditorHandle | null>(null);
	const jumpToError = (e: ParseError) => {
		if (e.line == null) return;
		editorRef.current?.jumpTo(e.line, e.column ?? 1);
	};

	return (
		<Dialog open={open} title={title} onClose={onClose} fullscreen>
			<div
				style={{
					padding: 12,
					display: "flex",
					flexDirection: "column",
					gap: 10,
					flex: 1,
					minHeight: 0,
				}}
			>
				{mode === "fix-load" && (
					<div
						style={{
							padding: "6px 10px",
							borderRadius: 4,
							background: "rgba(255, 196, 0, 0.12)",
							border: "1px solid rgba(255, 196, 0, 0.5)",
							fontSize: 12,
							color: "var(--text)",
						}}
					>
						JSON の読み込みに失敗しました。下のエディタで直接修正して「適用」を押すと、
						まっさらな状態から再ロードします。
					</div>
				)}

				<div
					data-testid="json-edit-status"
					data-dirty={isDirty}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "4px 10px",
						borderRadius: 4,
						border: `1px solid ${isDirty ? "rgba(255, 149, 0, 0.6)" : "rgba(52, 199, 89, 0.5)"}`,
						background: isDirty ? "rgba(255, 149, 0, 0.10)" : "rgba(52, 199, 89, 0.08)",
						fontSize: 12,
						color: "var(--text)",
					}}
				>
					<span
						aria-hidden
						style={{
							width: 8,
							height: 8,
							borderRadius: "50%",
							background: isDirty ? "#ff9500" : "#34c759",
							display: "inline-block",
							flex: "none",
						}}
					/>
					<span style={{ fontWeight: 600 }}>{isDirty ? "未適用の変更があります" : "適用済み"}</span>
					<span style={{ color: "var(--text-muted)" }}>
						{isDirty
							? "「適用」または Ctrl/Cmd + S で反映してください"
							: "現在のデータは下のテキストと一致しています"}
					</span>
				</div>

				{errors.length > 0 && (
					<div
						role="alert"
						data-testid="json-edit-error"
						style={{
							padding: "6px 10px",
							borderRadius: 4,
							background: "rgba(220, 50, 47, 0.12)",
							border: "1px solid rgba(220, 50, 47, 0.6)",
							color: "var(--danger, #d33)",
							fontSize: 12,
							maxHeight: 160,
							overflowY: "auto",
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						}}
					>
						<div style={{ fontWeight: 600, marginBottom: 4 }}>エラー {errors.length} 件</div>
						<ul style={{ margin: 0, paddingLeft: 18 }}>
							{errors.map((e, i) => {
								const clickable = e.line != null;
								return (
									<li
										key={i}
										data-testid="json-edit-error-item"
										data-error-line={e.line}
										style={{
											whiteSpace: "pre-wrap",
											cursor: clickable ? "pointer" : "default",
											textDecoration: clickable ? "underline" : "none",
											textDecorationStyle: "dotted",
										}}
										onClick={clickable ? () => jumpToError(e) : undefined}
										title={clickable ? "クリックで該当行にジャンプ" : undefined}
									>
										{e.message}
									</li>
								);
							})}
						</ul>
					</div>
				)}

				<JsonEditor ref={editorRef} value={text} onChange={setText} schema={schema} />

				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						gap: 8,
					}}
				>
					<button
						type="button"
						onClick={handleFormat}
						style={{
							padding: "5px 14px",
							fontSize: 13,
							border: "1px solid var(--border)",
							borderRadius: 4,
							background: "var(--bg)",
							color: "var(--text)",
							cursor: "pointer",
						}}
						title="JSON を整形 (インデントを揃える)"
					>
						整形
					</button>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							type="button"
							onClick={onClose}
							style={{
								padding: "5px 14px",
								fontSize: 13,
								border: "1px solid var(--border)",
								borderRadius: 4,
								background: "var(--bg)",
								color: "var(--text)",
								cursor: "pointer",
							}}
						>
							キャンセル
						</button>
						<button
							type="button"
							onClick={apply}
							style={{
								padding: "5px 14px",
								fontSize: 13,
								border: "none",
								borderRadius: 4,
								background: isDirty ? "var(--accent)" : "var(--border)",
								color: isDirty ? "#fff" : "var(--text-muted)",
								cursor: "pointer",
								fontWeight: isDirty ? 600 : 400,
								// 未適用のときは少し主張させる枠線を付ける
								boxShadow: isDirty ? "0 0 0 2px rgba(0, 113, 227, 0.25)" : "none",
							}}
							title="適用 (Ctrl/Cmd + S)"
						>
							{isDirty ? "● 適用" : "適用"}
						</button>
					</div>
				</div>
			</div>
		</Dialog>
	);
}
