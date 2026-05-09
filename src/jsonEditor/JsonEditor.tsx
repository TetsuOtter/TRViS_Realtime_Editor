import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightWhitespace, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { json, jsonLanguage, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { basicSetup } from "codemirror";
import {
	handleRefresh,
	jsonCompletion,
	jsonSchemaLinter,
	stateExtensions,
} from "codemirror-json-schema";
import type { JSONSchema7 } from "json-schema";

interface Props {
	value: string;
	onChange: (value: string) => void;
	schema?: JSONSchema7;
	/**
	 * エディタの高さ。
	 *   - 数値 / 文字列 (例: `"360px"`, `"50vh"`) を渡すと CodeMirror 側にその高さを設定する。
	 *   - 省略時は親要素の高さに合わせて伸縮する (`flex: 1` 配下に置く想定)。
	 */
	height?: number | string;
}

export interface JsonEditorHandle {
	/**
	 * 1 始まりの (line, column) にキャレットを移動し、画面内に収めてフォーカスする。
	 * column 省略時は行頭。範囲外は安全側にクランプする。
	 */
	jumpTo(line: number, column?: number): void;
}

/**
 * CodeMirror v6 ベースの JSON エディタ。
 *   - `@codemirror/lang-json` で JSON シンタックスハイライト
 *   - `codemirror-json-schema` で `schema` に基づく入力補完 / リンタ (hover は無効化)
 *   - タブ・スペースを `highlightWhitespace()` で可視化 (タブ → ▷ / スペース → ·)
 *
 * value -> onChange の単方向で扱う controlled component 風 API。
 * 親が `value` を更新したら、現在のドキュメントと差分があれば反映する
 * (履歴を破壊しないよう、変更があるときだけ dispatch する)。
 *
 * 親からの操作用に `jumpTo(line, column)` を `ref` で公開する。
 */
export const JsonEditor = forwardRef<JsonEditorHandle, Props>(function JsonEditor(
	{ value, onChange, schema, height },
	ref,
) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	// onChange を ref に逃がしておくことで、親が再レンダリングするたびに
	// EditorView を作り直さなくて済む。
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	// EditorView は初回マウント時に作る。schema が変わった場合のみ作り直す。
	useEffect(() => {
		if (!hostRef.current) return;

		const themeRules: Record<string, Record<string, string>> = {
			".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
			// タブ可視化文字をスペースより目立たせる
			".cm-highlightTab": { color: "var(--text-muted)", opacity: "0.7" },
			".cm-highlightSpace": { color: "var(--text-muted)", opacity: "0.35" },
		};
		if (height != null) {
			themeRules["&"] = { height: typeof height === "number" ? `${height}px` : height };
		} else {
			// 親が flex 等で高さを与える場合は CodeMirror 側を 100% にして伸縮させる。
			themeRules["&"] = { height: "100%" };
			themeRules[".cm-scroller"] = {
				...themeRules[".cm-scroller"],
				overflow: "auto",
			};
		}

		const extensions: Extension[] = [
			basicSetup,
			keymap.of([...defaultKeymap, indentWithTab]),
			highlightWhitespace(),
			EditorView.updateListener.of((v) => {
				if (v.docChanged) {
					onChangeRef.current(v.state.doc.toString());
				}
			}),
			EditorView.theme(themeRules),
		];
		if (schema) {
			// `jsonSchema(schema)` バンドルは hoverTooltip も含むので、ホバー時に
			// スキーマ説明がポップアップしてしまう。ホバーは邪魔なので除外して
			// 個別に必要な部品 (json / linter / 補完 / state) だけを足す。
			extensions.push(
				json(),
				linter(jsonParseLinter()),
				linter(jsonSchemaLinter(), { needsRefresh: handleRefresh }),
				jsonLanguage.data.of({ autocomplete: jsonCompletion() }),
				stateExtensions(schema),
			);
		}

		const view = new EditorView({
			state: EditorState.create({ doc: value, extensions }),
			parent: hostRef.current,
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// schema / height は再マウント要因として意図的に依存に含める。
		// value はマウント時の初期値だけ使い、以降は下の useEffect で同期する。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [schema, height]);

	// 親から渡された value が現在の doc と異なる場合だけ反映する。
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const cur = view.state.doc.toString();
		if (cur === value) return;
		view.dispatch({
			changes: { from: 0, to: cur.length, insert: value },
		});
	}, [value]);

	useImperativeHandle(
		ref,
		() => ({
			jumpTo(line, column = 1) {
				const view = viewRef.current;
				if (!view) return;
				const totalLines = view.state.doc.lines;
				const safeLine = Math.max(1, Math.min(line, totalLines));
				const lineInfo = view.state.doc.line(safeLine);
				const pos = Math.min(lineInfo.from + Math.max(0, column - 1), lineInfo.to);
				view.dispatch({
					selection: { anchor: pos },
					scrollIntoView: true,
				});
				view.focus();
			},
		}),
		[],
	);

	return (
		<div
			ref={hostRef}
			style={{
				border: "1px solid var(--border)",
				borderRadius: 4,
				overflow: "hidden",
				background: "var(--bg)",
				// height 未指定時は親の flex 領域いっぱいに広がる。
				flex: height == null ? 1 : "none",
				minHeight: 0,
			}}
		/>
	);
});
