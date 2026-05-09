import { describe, expect, it } from "vitest";
import { tryParseDocument, positionToLineColumn, validateAgainstSchema } from "./parseDocument";
import { workGroupArraySchema } from "./schema";

describe("tryParseDocument", () => {
	it("配列を受け取って WorkGroupData[] として返す", () => {
		const r = tryParseDocument(
			JSON.stringify([
				{ Id: "wg1", Name: "G1", Works: [] },
				{ Id: "wg2", Name: "G2", Works: [] },
			]),
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.map((w) => w.Id)).toEqual(["wg1", "wg2"]);
	});

	it("単一オブジェクトを配列にラップする", () => {
		const r = tryParseDocument(JSON.stringify({ Id: "wg", Name: "G", Works: [] }));
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.data).toHaveLength(1);
			expect(r.data[0].Name).toBe("G");
		}
	});

	it("JSON 構文エラーを 行:列 付きで返す (常に 1 行目にはならない)", () => {
		const text = '{\n  "Name": "x",\n  "Works": [,]\n}';
		const r = tryParseDocument(text);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors.length).toBeGreaterThanOrEqual(1);
			const first = r.errors[0];
			expect(first.message).toMatch(/JSON 構文エラー/);
			// `[` の直後の `,` は 3 行目にあるので、最初のエラーは 3 行目
			expect(first.line).toBe(3);
			expect(first.column).toBeGreaterThanOrEqual(1);
		}
	});

	it("複数の構文エラーをすべて個別に返す (1 行目だけにならない)", () => {
		// 2 行目: ColonExpected (キー名のあとに ':' がない)
		// 4 行目: CommaExpected (要素間カンマがない)
		// 5 行目: CloseBraceExpected もしくは類似 (閉じ '}' がない)
		const text = '{\n  "a" 1,\n  "b": [\n    1 2\n';
		const r = tryParseDocument(text);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			// 少なくとも 2 件のエラーが個別に出ること
			expect(r.errors.length).toBeGreaterThanOrEqual(2);
			// 1 行目だけに集中していないこと (= 異なる行のエラーが混ざっている)
			const linesSeen = new Set(r.errors.map((e) => e.line));
			expect(linesSeen.size).toBeGreaterThanOrEqual(2);
			expect(linesSeen.has(1)).toBe(false); // 1 行目には何も問題が無い
		}
	});

	it("同じ位置の PropertyNameExpected + ValueExpected は「不要なカンマ」にまとめられる", () => {
		// 末尾カンマ in object: jsonc-parser は同じ offset に
		// PropertyNameExpected + ValueExpected を出すので、これを 1 件にまとめる。
		const r = tryParseDocument('{"a":1,}');
		expect(r.ok).toBe(false);
		if (!r.ok) {
			const joined = r.errors.map((e) => e.message).join("\n");
			expect(joined).toMatch(/不要なカンマ/);
			// マージされた結果として個別の「プロパティ名/値が必要」が同じ箇所では出ない
			expect(joined).not.toMatch(/プロパティ名が必要/);
			expect(joined).not.toMatch(/値が必要/);
			expect(r.errors).toHaveLength(1);
		}
	});

	it("「不要なカンマ」の位置はバリデータ通知位置の直前のカンマに補正される", () => {
		// `}` は 8 列目だが、カンマは 7 列目にある。
		const r = tryParseDocument('{"a":1,}');
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors).toHaveLength(1);
			expect(r.errors[0].column).toBe(7);
			expect(r.errors[0].line).toBe(1);
		}
	});

	it("カンマと閉じ括弧の間に空白・改行が挟まっても、カンマの位置に補正される", () => {
		// 1 行目の末尾の `,` (col 8) → 2 行目に `}` がある。エラーは 1:8 を指してほしい。
		const text = '{"a": 1,\n}';
		const r = tryParseDocument(text);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors).toHaveLength(1);
			expect(r.errors[0].line).toBe(1);
			expect(r.errors[0].column).toBe(8);
		}
	});

	it("配列の末尾カンマ `[1,]` も「不要なカンマ」としてカンマ位置で報告される", () => {
		// `]` ではなく `,` (col 3) を指す。
		const r = tryParseDocument("[1,]");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors).toHaveLength(1);
			expect(r.errors[0].message).toMatch(/不要なカンマ/);
			expect(r.errors[0].line).toBe(1);
			expect(r.errors[0].column).toBe(3);
		}
	});

	it("配列の重複カンマ `[1,,2]` も「不要なカンマ」になる", () => {
		// 2 番目の `,` (col 4) が冗長。
		const r = tryParseDocument("[1,,2]");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors).toHaveLength(1);
			expect(r.errors[0].message).toMatch(/不要なカンマ/);
			expect(r.errors[0].column).toBe(4);
		}
	});

	it("`{,}` のように複数のエラーが同じカンマに帰着する場合は 1 件に集約される", () => {
		const r = tryParseDocument("{,}");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors).toHaveLength(1);
			expect(r.errors[0].message).toMatch(/不要なカンマ/);
			expect(r.errors[0].column).toBe(2); // `,` の位置
		}
	});

	it("文字列やプリミティブはトップレベルとして拒否する", () => {
		const r = tryParseDocument("42");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors[0].message).toMatch(/トップレベル/);
	});
});

describe("positionToLineColumn", () => {
	it("position 0 は 1:1", () => {
		expect(positionToLineColumn("abc", 0)).toEqual({ line: 1, column: 1 });
	});

	it("改行を跨ぐと行が増える", () => {
		const text = "abc\ndef\nghi";
		expect(positionToLineColumn(text, 4)).toEqual({ line: 2, column: 1 });
		expect(positionToLineColumn(text, 5)).toEqual({ line: 2, column: 2 });
		expect(positionToLineColumn(text, 8)).toEqual({ line: 3, column: 1 });
	});

	it("末尾より大きい position は末尾にクランプ", () => {
		const r = positionToLineColumn("abc", 999);
		expect(r.line).toBe(1);
		expect(r.column).toBe(4);
	});
});

describe("validateAgainstSchema", () => {
	it("妥当なデータではエラー無し", () => {
		const errs = validateAgainstSchema(
			[
				{
					Id: "wg",
					Name: "G",
					Works: [
						{
							Name: "W",
							Trains: [
								{
									TrainNumber: "1",
									Direction: 1,
									TimetableRows: [{ StationName: "東京", Location_m: 0 }],
								},
							],
						},
					],
				},
			],
			workGroupArraySchema,
		);
		expect(errs).toEqual([]);
	});

	it("複数の必須フィールド欠落をすべて返す (個別に)", () => {
		// Name が無い WorkGroup と、TrainNumber が無い Train、StationName が無い Row
		const errs = validateAgainstSchema(
			[
				{
					// Name 無し → エラー
					Works: [
						{
							Name: "W",
							Trains: [
								{
									// TrainNumber 無し → エラー
									Direction: 1,
									TimetableRows: [{ /* StationName 無し → エラー */ Location_m: 0 }],
								},
							],
						},
					],
				},
			],
			workGroupArraySchema,
		);
		// 少なくとも 3 件のエラーが個別に出ること
		expect(errs.length).toBeGreaterThanOrEqual(3);
		const joined = errs.map((e) => e.message).join("\n");
		expect(joined).toMatch(/Name/);
		expect(joined).toMatch(/TrainNumber/);
		expect(joined).toMatch(/StationName/);
		// 各エラーに pointer が付いている
		for (const e of errs) {
			expect(e.pointer).toBeTruthy();
		}
	});
});
