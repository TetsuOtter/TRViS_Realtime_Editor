import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionPanel } from "../ConnectionPanel";

vi.mock("../../api/wsServer", () => ({
	startServer: vi.fn().mockResolvedValue({ port: 23519, hosts: ["127.0.0.1"] }),
	stopServer: vi.fn().mockResolvedValue(undefined),
	listLocalHosts: vi.fn().mockResolvedValue(["127.0.0.1"]),
	subscribeWsEvents: vi.fn().mockResolvedValue(() => {}),
	getTrvisAppLinkWs: vi
		.fn()
		.mockImplementation((host, port) => `trvis://app/open/json?path=ws://${host}:${port}/ws`),
}));

vi.mock("qrcode", () => ({
	default: {
		toCanvas: vi.fn().mockResolvedValue(undefined),
	},
	toCanvas: vi.fn().mockResolvedValue(undefined),
}));

describe("ConnectionPanel", () => {
	it("「起動」ボタンが表示される", () => {
		render(<ConnectionPanel />);
		expect(screen.getByText("起動")).toBeInTheDocument();
	});

	it("「停止」ボタンが表示される", () => {
		render(<ConnectionPanel />);
		expect(screen.getByText("停止")).toBeInTheDocument();
	});

	it("初期状態では「停止中」と表示される", () => {
		render(<ConnectionPanel />);
		expect(screen.getByText("停止中")).toBeInTheDocument();
	});

	it("初期状態では「起動」ボタンは有効", () => {
		render(<ConnectionPanel />);
		const startBtn = screen.getByText("起動");
		expect(startBtn).not.toBeDisabled();
	});

	it("初期状態では「停止」ボタンは無効", () => {
		render(<ConnectionPanel />);
		const stopBtn = screen.getByText("停止");
		expect(stopBtn).toBeDisabled();
	});
});
