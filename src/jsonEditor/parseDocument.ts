import {
	parse as jsoncParse,
	printParseErrorCode,
	type ParseError as JsoncParseError,
} from "jsonc-parser";
import { Draft07 } from "json-schema-library";
import type { JSONSchema7 } from "json-schema";
import type { WorkGroupData } from "../types/trvis";

export interface ParseError {
	/** ユーザに見せるメッセージ。`(行:列)` などの位置情報は含めずシンプルに保つ。 */
	message: string;
	line?: number;
	column?: number;
	/** スキーマ検証エラー時の JSON Pointer (例: `/0/Works/1/Trains`)。 */
	pointer?: string;
}

export type ParseResult = { ok: true; data: WorkGroupData[] } | { ok: false; errors: ParseError[] };

/** jsonc-parser のエラーコード → 日本語表記 */
const errorCodeJa: Record<string, string> = {
	InvalidSymbol: "不正な記号",
	InvalidNumberFormat: "不正な数値形式",
	PropertyNameExpected: "プロパティ名が必要です",
	ValueExpected: "値が必要です",
	ColonExpected: "':' が必要です",
	CommaExpected: "',' が必要です",
	CloseBraceExpected: "'}' が必要です",
	CloseBracketExpected: "']' が必要です",
	EndOfFileExpected: "ファイル終端が必要です (余計なトークン)",
	InvalidCommentToken: "不正なコメントトークン",
	UnexpectedEndOfComment: "コメントが閉じていません",
	UnexpectedEndOfString: "文字列が閉じていません",
	UnexpectedEndOfNumber: "数値が途中で終わっています",
	InvalidUnicode: "不正な Unicode エスケープ",
	InvalidEscapeCharacter: "不正なエスケープ文字",
	InvalidCharacter: "不正な文字",
};

/**
 * JSON テキストを `WorkGroupData[]` に変換する。失敗時はユーザに見せるための
 * エラー一覧を返す。
 *
 * パーサは `JSON.parse` ではなく **`jsonc-parser`** を使う。これにより:
 *   - 1 ファイルに複数の構文エラーがあっても、最初の 1 件だけでなく **全件** を
 *     行:列 付きで返せる。
 *   - エラーコードが安定 (`PropertyNameExpected` 等) なので日本語訳を当てられる。
 *   - 厳密モード (コメント禁止 / 末尾カンマ禁止 / 空ファイル禁止) で、TRViS の
 *     JSON フォーマットと整合する。
 *
 * 配列でなければ単一オブジェクトとして配列にラップする (従来動作互換)。
 */
export function tryParseDocument(text: string): ParseResult {
	const parseErrors: JsoncParseError[] = [];
	const json = jsoncParse(text, parseErrors, {
		disallowComments: true,
		allowTrailingComma: false,
		allowEmptyContent: false,
	});

	if (parseErrors.length > 0) {
		return { ok: false, errors: condenseSyntaxErrors(parseErrors, text) };
	}

	if (Array.isArray(json)) {
		return { ok: true, data: json as WorkGroupData[] };
	}
	if (json !== null && typeof json === "object") {
		return { ok: true, data: [json as WorkGroupData] };
	}
	return {
		ok: false,
		errors: [
			{
				message: `トップレベルが配列でもオブジェクトでもありません (${typeof json})`,
			},
		],
	};
}

function formatSyntaxError(e: JsoncParseError, text: string): ParseError {
	const { line, column } = positionToLineColumn(text, e.offset);
	const code = printParseErrorCode(e.error);
	const ja = errorCodeJa[code] ?? code;
	return {
		message: `JSON 構文エラー (${line} 行 ${column} 列): ${ja}`,
		line,
		column,
	};
}

/**
 * jsonc-parser のエラー一覧を条件付きでマージしてユーザに見せる。
 *
 * 「不要なカンマ」と判断するパターン:
 *   1. `PropertyNameExpected` と `ValueExpected` が **同じ offset** に並ぶ
 *      → オブジェクトの末尾カンマ (例: `{"a":1,}`) や `{,}` などの典型例。
 *   2. 単独の `ValueExpected` で、その通知位置 (または直前の空白を遡った先) が
 *      `,` である → 配列の末尾カンマ `[1,]` や `[1,,2]` の重複カンマなど。
 *
 * 報告位置はいずれの場合も **対応するカンマの offset** に補正する。jsonc-parser は
 * 閉じ括弧 `]` / `}` の位置で通知するが、ユーザが直したいのは手前のカンマ自身。
 * 既にカンマ位置で通知されている場合はそのまま使う。
 *
 * 同じカンマに対して複数のエラーが解決される場合 (例: `{,}` は 3 件出る) は
 * 1 件に集約する。
 */
function condenseSyntaxErrors(parseErrors: JsoncParseError[], text: string): ParseError[] {
	const sorted = [...parseErrors].sort((a, b) => a.offset - b.offset);
	const out: ParseError[] = [];
	const reportedCommaOffsets = new Set<number>();

	const pushRedundantComma = (commaOffset: number) => {
		if (reportedCommaOffsets.has(commaOffset)) return;
		reportedCommaOffsets.add(commaOffset);
		const { line, column } = positionToLineColumn(text, commaOffset);
		out.push({
			message: `JSON 構文エラー (${line} 行 ${column} 列): 不要なカンマがあります`,
			line,
			column,
		});
	};

	for (let i = 0; i < sorted.length; i++) {
		const cur = sorted[i];
		const next = sorted[i + 1];

		// 1. 同 offset の PropertyNameExpected + ValueExpected ペア
		if (next && cur.offset === next.offset) {
			const codes = new Set([printParseErrorCode(cur.error), printParseErrorCode(next.error)]);
			if (codes.has("PropertyNameExpected") && codes.has("ValueExpected")) {
				const commaOffset = findPrecedingCommaOffset(text, cur.offset);
				if (text[commaOffset] === ",") {
					pushRedundantComma(commaOffset);
					i++; // ペアで消費
					continue;
				}
			}
		}

		// 2. 単独 ValueExpected で対応するカンマが見つかる場合
		if (printParseErrorCode(cur.error) === "ValueExpected") {
			const commaOffset = findPrecedingCommaOffset(text, cur.offset);
			if (text[commaOffset] === ",") {
				pushRedundantComma(commaOffset);
				continue;
			}
		}

		out.push(formatSyntaxError(cur, text));
	}
	return out;
}

/**
 * `offset` から手前 (左) に向けて空白 (スペース / タブ / 改行) を読み飛ばし、
 * 最初に見つけたカンマの offset を返す。
 *   - `text[offset]` が既にカンマならそのまま返す。
 *   - 途中で空白以外の文字に当たった場合や、カンマが見つからない場合は
 *     元の offset を返す (フォールバック)。
 */
function findPrecedingCommaOffset(text: string, offset: number): number {
	if (text[offset] === ",") return offset;
	let i = offset - 1;
	while (i >= 0) {
		const c = text[i];
		if (c === ",") return i;
		if (c === " " || c === "\t" || c === "\n" || c === "\r") {
			i--;
			continue;
		}
		break;
	}
	return offset;
}

/** 0 始まりの文字位置を 1 始まりの (line, column) に変換する。 */
export function positionToLineColumn(text: string, pos: number): { line: number; column: number } {
	const safePos = Math.max(0, Math.min(pos, text.length));
	let line = 1;
	let lineStart = 0;
	for (let i = 0; i < safePos; i++) {
		if (text.charCodeAt(i) === 0x0a) {
			line++;
			lineStart = i + 1;
		}
	}
	return { line, column: safePos - lineStart + 1 };
}

/**
 * JSON Schema (Draft-07) でデータを検証し、エラーをすべて返す。
 *
 * 内部で `json-schema-library` の `Draft07` を使う。CodeMirror 側で動いている
 * リンタ (`jsonSchemaLinter`) と同じバリデータを使うため、表示と適用時の
 * 判定が食い違わない。
 */
export function validateAgainstSchema(data: unknown, schema: JSONSchema7): ParseError[] {
	// JSONSchema7 と Draft07 のスキーマ型は実質互換だが TS 上は別物なので unknown を経由。
	const draft = new Draft07(schema as unknown as Parameters<typeof Draft07.prototype.setSchema>[0]);
	const errors = draft.validate(data);
	return errors.map((err) => {
		const pointer =
			typeof err.data?.pointer === "string" && err.data.pointer.length > 0
				? err.data.pointer
				: undefined;
		const where = pointer ? ` (${pointer})` : "";
		return {
			message: `スキーマ違反${where}: ${err.message}`,
			pointer,
		};
	});
}
