import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SyncedDataPanel } from "../SyncedDataPanel";
import { useEditorStore } from "../../store/editorStore";

vi.mock("../../api/wsServer", () => ({
	setSyncedData: vi.fn().mockResolvedValue(undefined),
}));

describe("SyncedDataPanel", () => {
	beforeEach(() => {
		useEditorStore.setState((s) => ({
			...s,
			syncedData: { Location_m: null, Time_ms: null, CanStart: true },
			autoTimeMs: true,
		}));
	});

	it("「同期データ (SyncedData)」ヘッダが表示される", () => {
		render(<SyncedDataPanel />);
		expect(screen.getByText("同期データ (SyncedData)")).toBeInTheDocument();
	});

	it("Location_m入力フィールドが表示される", () => {
		render(<SyncedDataPanel />);
		expect(screen.getByText("位置 Location_m")).toBeInTheDocument();
	});

	it("「定期配信開始」ボタンが表示される", () => {
		render(<SyncedDataPanel />);
		expect(screen.getByText("定期配信開始")).toBeInTheDocument();
	});

	it("「一回送信」ボタンが表示される", () => {
		render(<SyncedDataPanel />);
		expect(screen.getByText("一回送信")).toBeInTheDocument();
	});

	it("「自動 (現在時刻)」チェックボックスのデフォルトはON", () => {
		render(<SyncedDataPanel />);
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.checked).toBe(true);
	});

	it("CanStart のセレクトに「はい」「いいえ」「未設定」がある", () => {
		render(<SyncedDataPanel />);
		const selects = screen.getAllByRole("combobox");
		const canStartSelect = selects[selects.length - 1];
		expect(canStartSelect).toBeInTheDocument();
		expect(canStartSelect.innerHTML).toContain("はい");
		expect(canStartSelect.innerHTML).toContain("いいえ");
		expect(canStartSelect.innerHTML).toContain("未設定");
	});

	it("「定期配信開始」クリックで「配信停止」に変わる", () => {
		render(<SyncedDataPanel />);
		const startBtn = screen.getByText("定期配信開始");
		fireEvent.click(startBtn);
		expect(screen.getByText("配信停止")).toBeInTheDocument();
	});
});
