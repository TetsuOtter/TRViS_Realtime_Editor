/**
 * TRViS.IO.Models の enum を JSON 上の int 値と一対一で写したもの。
 *
 * 元定義:
 *   - https://github.com/TetsuOtter/TRViS `TRViS.IO.ILoader/Models/ContentType.cs`
 *   - https://github.com/TetsuOtter/TRViS `TRViS.IO.ILoader/Models/StationRecordType.cs`
 *
 * 値は C# enum の既定序数 (0 始まり) と一致させること。
 */

export interface EnumOption {
	value: number;
	label: string;
}

/** `WorkData.AffixContentType` / `WorkData.ETrainTimetableContentType` 用。 */
export const CONTENT_TYPE_OPTIONS: EnumOption[] = [
	{ value: 0, label: "0: Text (テキスト)" },
	{ value: 1, label: "1: URI (URL)" },
	{ value: 2, label: "2: PNG" },
	{ value: 3, label: "3: PDF" },
	{ value: 4, label: "4: JPG" },
];

/** `TimetableRowData.RecordType` 用 (StationRecordType)。 */
export const STATION_RECORD_TYPE_OPTIONS: EnumOption[] = [
	{ value: 0, label: "0: 通常駅 (横型時刻表に表示)" },
	{ value: 1, label: "1: 通常駅 (横型時刻表に非表示)" },
	{ value: 2, label: "2: 情報行 (ほぼ全列車向け)" },
	{ value: 3, label: "3: 情報行 (一部列車向け)" },
];

/**
 * ファイル名の拡張子から `ContentType` の int を推定する。
 * 判定できない場合は null (=コンテンツタイプを変更しない)。
 */
export function contentTypeFromFileName(name: string): number | null {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	switch (ext) {
		case "png":
			return 2;
		case "pdf":
			return 3;
		case "jpg":
		case "jpeg":
			return 4;
		default:
			return null;
	}
}

/**
 * ファイル名の拡張子から通告音の形式 ("wav"/"mp3") を推定する。
 * 判定できない場合は null (=形式を変更しない)。
 */
export function soundFormatFromFileName(name: string): "wav" | "mp3" | null {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	switch (ext) {
		case "wav":
			return "wav";
		case "mp3":
			return "mp3";
		default:
			return null;
	}
}

/** これより長く、かつ base64 らしい内容は textarea 描画が重いとみなす閾値。 */
export const LARGE_CONTENT_THRESHOLD = 4096;

/**
 * 文字列が base64 (添付ファイルのエンコード結果) らしいかを判定する。
 * Text / URI のような短い・記号混じりの内容を誤判定しないよう、
 * 長さ閾値と base64 文字種 (+ 任意の改行/空白) のみで構成されることを見る。
 */
export function isLikelyBase64(s: string): boolean {
	return s.length >= LARGE_CONTENT_THRESHOLD && /^[A-Za-z0-9+/\s]+={0,2}\s*$/.test(s);
}

/**
 * File をその生バイト列の base64 文字列へ変換する。
 *
 * TRViS 本体は `Convert.FromBase64String` で復号する (data URI 前置きは不可) ため、
 * `readAsDataURL` の `data:...;base64,` プレフィクスは除去して純粋な base64 を返す。
 */
export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("ファイル読み込みに失敗しました"));
		reader.onload = () => {
			const result = String(reader.result ?? "");
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.readAsDataURL(file);
	});
}

/**
 * File を `data:<mime>;base64,...` 形式の data URI へ変換する。
 *
 * TRViS 本体の `ServerInfo.IconImage`/`IconImageDark` は data URI (もしくは
 * PNG 扱いのプレーン base64) を受け付けるため、`fileToBase64` と異なり
 * プレフィクスを保持する (png/jpg/gif/svg のいずれも mime 判別に必要)。
 */
export function fileToImageDataUri(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("ファイル読み込みに失敗しました"));
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.readAsDataURL(file);
	});
}

/** 長さのみで「描画が重い可能性のある内容」を判定する ( data URI は base64 文字種のみとは限らないため)。 */
export function isLikelyLargeContent(s: string): boolean {
	return s.length >= LARGE_CONTENT_THRESHOLD;
}
