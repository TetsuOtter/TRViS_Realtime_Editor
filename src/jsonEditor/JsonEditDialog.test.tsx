/**
 * JsonEditDialog の振る舞い (parse → apply / error 表示) をテストする。
 * CodeMirror の EditorView は happy-dom では完全には動かないので、
 * JsonEditor を <textarea> ベースのスタブに差し替えて UI ロジックだけを検証する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JsonEditDialog } from "./JsonEditDialog";
import { useEditorStore } from "../store/editorStore";

const { jumpToMock } = vi.hoisted(() => ({ jumpToMock: vi.fn() }));

vi.mock("./JsonEditor", async () => {
	const React = await import("react");
	const Mock = React.forwardRef(
		(
			{ value, onChange }: { value: string; onChange: (v: string) => void },
			ref: React.Ref<{ jumpTo: (line: number, column?: number) => void }>,
		) => {
			React.useImperativeHandle(ref, () => ({ jumpTo: jumpToMock }), []);
			return (
				<textarea
					data-testid="json-editor"
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		},
	);
	Mock.displayName = "MockJsonEditor";
	return { JsonEditor: Mock };
});

beforeEach(() => {
	useEditorStore.setState({
		workGroups: [],
		selection: {},
		remoteSelection: null,
		history: { past: [], future: [] },
	});
	jumpToMock.mockClear();
});

describe("JsonEditDialog", () => {
	it("mode=fix-load: 初期エラーが表示され、修正後に「適用」で loadDocument される", () => {
		const onClose = vi.fn();
		const { rerender } = render(
			<JsonEditDialog
				open={true}
				mode="fix-load"
				initialText='{"Name": "x", "Works": [,]}'
				initialErrors={[{ message: "JSON 構文エラー (3 行 12 列): ValueExpected" }]}
				onClose={onClose}
			/>,
		);
		expect(screen.getByTestId("json-edit-error")).toHaveTextContent("JSON 構文エラー");

		// 中身を有効な JSON に直す
		const textarea = screen.getByTestId("json-editor") as HTMLTextAreaElement;
		fireEvent.change(textarea, {
			target: {
				value: JSON.stringify([{ Id: "wg-fixed", Name: "Fixed", Works: [] }]),
			},
		});
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));

		expect(useEditorStore.getState().workGroups[0].Name).toBe("Fixed");
		expect(useEditorStore.getState().selection).toEqual({}); // loadDocument のリセット
		// 適用しただけではダイアログは閉じない
		expect(onClose).not.toHaveBeenCalled();
		rerender(<JsonEditDialog open={false} mode="fix-load" initialText="" onClose={onClose} />);
	});

	it("mode=edit: 適用で replaceDocument され、選択が維持される", () => {
		// 既存データと選択をセット
		useEditorStore.getState().loadDocument([
			{
				Id: "wg",
				Name: "G",
				Works: [
					{
						Id: "w",
						Name: "W",
						Trains: [{ Id: "t", TrainNumber: "1", Direction: 1, TimetableRows: [] }],
					},
				],
			},
		]);
		useEditorStore.setState({ selection: { workGroupId: "wg", workId: "w", trainId: "t" } });

		const onClose = vi.fn();
		const initial = JSON.stringify(useEditorStore.getState().workGroups, null, 2);
		render(<JsonEditDialog open={true} mode="edit" initialText={initial} onClose={onClose} />);

		// 同じ ID 構造で TrainNumber だけ変えて適用
		const newDoc = JSON.stringify([
			{
				Id: "wg",
				Name: "G",
				Works: [
					{
						Id: "w",
						Name: "W",
						Trains: [{ Id: "t", TrainNumber: "9999", Direction: 1, TimetableRows: [] }],
					},
				],
			},
		]);
		fireEvent.change(screen.getByTestId("json-editor"), { target: { value: newDoc } });
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));

		const s = useEditorStore.getState();
		expect(s.workGroups[0].Works[0].Trains[0].TrainNumber).toBe("9999");
		expect(s.selection).toEqual({ workGroupId: "wg", workId: "w", trainId: "t" });
		// 適用しただけではダイアログは閉じない
		expect(onClose).not.toHaveBeenCalled();
	});

	it("「整形」ボタンで JSON が整形され、不正な JSON だとエラー表示される", () => {
		const onClose = vi.fn();
		render(
			<JsonEditDialog
				open={true}
				mode="edit"
				initialText='{"Name":"x","Works":[]}'
				onClose={onClose}
			/>,
		);
		fireEvent.click(screen.getByText("整形"));
		const textarea = screen.getByTestId("json-editor") as HTMLTextAreaElement;
		// インデント込みの整形済み JSON になっている
		expect(textarea.value).toContain('\n  "Name": "x"');

		// 不正な JSON にしてから 整形 → エラー
		fireEvent.change(textarea, { target: { value: "{not json" } });
		fireEvent.click(screen.getByText("整形"));
		expect(screen.getByTestId("json-edit-error")).toHaveTextContent(/JSON 構文エラー/);
	});

	it("未適用バッジが、編集 → 適用で dirty / 適用済みに切り替わる", () => {
		const onClose = vi.fn();
		render(<JsonEditDialog open={true} mode="edit" initialText="[]" onClose={onClose} />);
		// 開いた直後は ストア = initialText で適用済み
		const status = screen.getByTestId("json-edit-status");
		expect(status.getAttribute("data-dirty")).toBe("false");
		expect(status).toHaveTextContent("適用済み");

		// テキストを編集 → 未適用
		fireEvent.change(screen.getByTestId("json-editor"), {
			target: { value: '[{"Id":"x","Name":"X","Works":[]}]' },
		});
		expect(screen.getByTestId("json-edit-status").getAttribute("data-dirty")).toBe("true");
		expect(screen.getByTestId("json-edit-status")).toHaveTextContent("未適用");

		// 適用すると 適用済み に戻る
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));
		expect(screen.getByTestId("json-edit-status").getAttribute("data-dirty")).toBe("false");
		expect(screen.getByTestId("json-edit-status")).toHaveTextContent("適用済み");
	});

	it("fix-load モードで開いた直後は dirty (まだストアに適用されていない)", () => {
		const onClose = vi.fn();
		render(
			<JsonEditDialog
				open={true}
				mode="fix-load"
				initialText='{"Name":"x","Works":[]}'
				initialErrors={[{ message: "JSON 構文エラー" }]}
				onClose={onClose}
			/>,
		);
		expect(screen.getByTestId("json-edit-status").getAttribute("data-dirty")).toBe("true");
	});

	it("Ctrl/Cmd+S で適用される (ダイアログは閉じない)", () => {
		const onClose = vi.fn();
		render(<JsonEditDialog open={true} mode="edit" initialText="[]" onClose={onClose} />);
		fireEvent.change(screen.getByTestId("json-editor"), {
			target: { value: JSON.stringify([{ Id: "wg-shortcut", Name: "FromShortcut", Works: [] }]) },
		});

		// Cmd+S
		fireEvent.keyDown(window, { key: "s", metaKey: true });
		expect(useEditorStore.getState().workGroups[0].Name).toBe("FromShortcut");
		expect(onClose).not.toHaveBeenCalled();

		// Ctrl+S も同様
		fireEvent.change(screen.getByTestId("json-editor"), {
			target: { value: JSON.stringify([{ Id: "wg-ctrl", Name: "FromCtrl", Works: [] }]) },
		});
		fireEvent.keyDown(window, { key: "s", ctrlKey: true });
		expect(useEditorStore.getState().workGroups[0].Name).toBe("FromCtrl");
	});

	it("エラー項目クリックで JsonEditor.jumpTo(line, column) が呼ばれる", () => {
		const onClose = vi.fn();
		render(<JsonEditDialog open={true} mode="edit" initialText="[]" onClose={onClose} />);
		// 3 行目の `,` で構文エラーを起こす
		const text = '{\n  "a": 1,\n  "b" 2\n}';
		fireEvent.change(screen.getByTestId("json-editor"), { target: { value: text } });
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));

		const items = screen.getAllByTestId("json-edit-error-item");
		expect(items.length).toBeGreaterThanOrEqual(1);
		fireEvent.click(items[0]);
		expect(jumpToMock).toHaveBeenCalledTimes(1);
		const [line, column] = jumpToMock.mock.calls[0];
		expect(typeof line).toBe("number");
		expect(line).toBeGreaterThanOrEqual(2);
		expect(typeof column).toBe("number");
	});

	it("オブジェクトの末尾カンマは「不要なカンマ」と 1 件にまとめて表示される", () => {
		const onClose = vi.fn();
		render(<JsonEditDialog open={true} mode="edit" initialText="[]" onClose={onClose} />);
		fireEvent.change(screen.getByTestId("json-editor"), {
			target: { value: '{"a":1,}' },
		});
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));
		const items = screen.getAllByTestId("json-edit-error-item");
		// ペア (PropertyNameExpected + ValueExpected) が 1 件になっている
		expect(items.some((li) => /不要なカンマ/.test(li.textContent ?? ""))).toBe(true);
		// 同じ箇所で「プロパティ名が必要」「値が必要」の両方が個別に出ていないこと
		const joined = items.map((li) => li.textContent).join("\n");
		expect(joined).not.toMatch(/プロパティ名が必要/);
		expect(joined).not.toMatch(/値が必要/);
	});

	it("複数の構文エラーがある場合、それぞれ個別に列挙される", () => {
		const onClose = vi.fn();
		render(<JsonEditDialog open={true} mode="edit" initialText="[]" onClose={onClose} />);
		// 複数の構文エラーを含むテキスト
		fireEvent.change(screen.getByTestId("json-editor"), {
			target: { value: '{\n  "a" 1,\n  "b": [\n    1 2\n' },
		});
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));
		const items = screen.getAllByTestId("json-edit-error-item");
		expect(items.length).toBeGreaterThanOrEqual(2);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("構文 OK でもスキーマ違反があれば適用されず、複数のスキーマエラーが個別に出る", () => {
		const onClose = vi.fn();
		render(<JsonEditDialog open={true} mode="edit" initialText="[]" onClose={onClose} />);
		// Name 無し WorkGroup + TrainNumber 無し Train + StationName 無し Row
		const broken = JSON.stringify([
			{
				Works: [
					{
						Name: "W",
						Trains: [
							{
								Direction: 1,
								TimetableRows: [{ Location_m: 0 }],
							},
						],
					},
				],
			},
		]);
		fireEvent.change(screen.getByTestId("json-editor"), { target: { value: broken } });
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));
		const items = screen.getAllByTestId("json-edit-error-item");
		expect(items.length).toBeGreaterThanOrEqual(3);
		// store には未反映 (workGroups は元のまま)
		expect(useEditorStore.getState().workGroups).toEqual([]);
	});

	it("不正な JSON を「適用」してもダイアログは閉じず、エラーが表示される", () => {
		const onClose = vi.fn();
		render(<JsonEditDialog open={true} mode="edit" initialText="{}" onClose={onClose} />);

		fireEvent.change(screen.getByTestId("json-editor"), {
			target: { value: '{ "Name": "broken", ' }, // 構文エラー
		});
		fireEvent.click(screen.getByTitle("適用 (Ctrl/Cmd + S)"));

		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByTestId("json-edit-error")).toHaveTextContent(/JSON 構文エラー/);
	});
});
