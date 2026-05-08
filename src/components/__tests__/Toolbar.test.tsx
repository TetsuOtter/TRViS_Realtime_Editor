import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar } from "../Toolbar";

vi.mock("../../api/wsServer", () => ({
	broadcastAllWorkGroups: vi.fn().mockResolvedValue(undefined),
}));

const addWorkGroupMock = vi.fn().mockReturnValue("new-id");
const undoMock = vi.fn();
const redoMock = vi.fn();
const loadDocumentMock = vi.fn();

const storeState = {
	workGroups: [],
	history: { past: [], future: [] },
	addWorkGroup: addWorkGroupMock,
	undo: undoMock,
	redo: redoMock,
	loadDocument: loadDocumentMock,
};

vi.mock("../../store/editorStore", () => ({
	useEditorStore: (selector?: (s: unknown) => unknown) => {
		if (typeof selector === "function") return selector(storeState);
		return storeState;
	},
}));

describe("Toolbar", () => {
	it("「JSONを開く」ボタンが表示される", () => {
		render(<Toolbar />);
		expect(screen.getByText("JSONを開く")).toBeInTheDocument();
	});

	it("「JSONをエクスポート」ボタンが表示される", () => {
		render(<Toolbar />);
		expect(screen.getByText("JSONをエクスポート")).toBeInTheDocument();
	});

	it("「元に戻す」ボタンが表示される", () => {
		render(<Toolbar />);
		expect(screen.getByText("↩ 元に戻す")).toBeInTheDocument();
	});

	it("「やり直す」ボタンが表示される", () => {
		render(<Toolbar />);
		expect(screen.getByText("↪ やり直す")).toBeInTheDocument();
	});

	it("「+ 仕業群追加」ボタンをクリックすると addWorkGroup が呼ばれる", () => {
		render(<Toolbar />);
		const addBtn = screen.getByText("+ 仕業群追加");
		fireEvent.click(addBtn);
		expect(addWorkGroupMock).toHaveBeenCalled();
	});

	it("履歴が空のとき「元に戻す」が無効", () => {
		render(<Toolbar />);
		const undoBtn = screen.getByText("↩ 元に戻す");
		expect(undoBtn).toBeDisabled();
	});
});
