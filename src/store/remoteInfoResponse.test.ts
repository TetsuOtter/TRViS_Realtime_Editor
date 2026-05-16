import { describe, it, expect } from "vitest";

import { buildServerInfoResponse, decideDiagramInfoResponse } from "./remoteInfoResponse";
import type { EditorDiagramInfo, EditorServerInfo } from "../types/trvis";

const baseServer: EditorServerInfo = {
	Name: "",
	Admin: "",
	Version: "",
	ProtocolVersion: "",
};

const baseDiagram: EditorDiagramInfo = {
	DiagramId: "",
	Name: "",
	Description: "",
	WorkGroupIds: [],
};

describe("buildServerInfoResponse", () => {
	it("空欄を null にし、Version 空欄はアプリ版で補う", () => {
		const r = buildServerInfoResponse(baseServer, "1.2.3");
		expect(r).toEqual({
			name: null,
			admin: null,
			version: "1.2.3",
			protocolVersion: "1.0",
		});
	});

	it("ProtocolVersion 空欄は現行 1.0 を補う", () => {
		const r = buildServerInfoResponse({ ...baseServer, ProtocolVersion: "  " }, "0.0.0");
		expect(r.protocolVersion).toBe("1.0");
	});

	it("設定値はトリムして返し、Version 指定時はアプリ版で上書きしない", () => {
		const r = buildServerInfoResponse(
			{ Name: " My Server ", Admin: " a@example.com ", Version: " 9.9 ", ProtocolVersion: "2" },
			"1.0.0",
		);
		expect(r).toEqual({
			name: "My Server",
			admin: "a@example.com",
			version: "9.9",
			protocolVersion: "2",
		});
	});
});

describe("decideDiagramInfoResponse", () => {
	it("ダイヤ情報が一切未設定なら無応答 (null)", () => {
		expect(decideDiagramInfoResponse(baseDiagram, null)).toBeNull();
		expect(decideDiagramInfoResponse(baseDiagram, "d-1")).toBeNull();
	});

	it("DiagramId 省略要求には設定済みダイヤを返す", () => {
		const info: EditorDiagramInfo = {
			DiagramId: "d-1",
			Name: "平日ダイヤ",
			Description: "2024改正",
			WorkGroupIds: ["wg-1", "wg-2"],
		};
		expect(decideDiagramInfoResponse(info, null)).toEqual({
			diagramId: "d-1",
			name: "平日ダイヤ",
			description: "2024改正",
			workGroupIds: ["wg-1", "wg-2"],
		});
	});

	it("DiagramId 指定が設定値と一致すれば返す", () => {
		const info = { ...baseDiagram, DiagramId: "d-1", Name: "A" };
		expect(decideDiagramInfoResponse(info, "d-1")?.diagramId).toBe("d-1");
	});

	it("DiagramId 指定が設定値と不一致なら無応答 (null)", () => {
		const info = { ...baseDiagram, DiagramId: "d-1", Name: "A" };
		expect(decideDiagramInfoResponse(info, "d-2")).toBeNull();
	});

	it("DiagramId 未設定でも他フィールドがあれば省略要求には応答する", () => {
		const info = { ...baseDiagram, Name: "ダイヤ名のみ" };
		expect(decideDiagramInfoResponse(info, null)).toEqual({
			diagramId: null,
			name: "ダイヤ名のみ",
			description: null,
			workGroupIds: null,
		});
	});

	it("DiagramId 未設定なら、DiagramId 指定要求には応答しない", () => {
		const info = { ...baseDiagram, Name: "ダイヤ名のみ" };
		expect(decideDiagramInfoResponse(info, "d-2")).toBeNull();
	});

	it("WorkGroupIds は trim + 空要素除去し、結果が空なら null", () => {
		const info: EditorDiagramInfo = {
			...baseDiagram,
			Name: "A",
			WorkGroupIds: [" wg-1 ", "", "  ", "wg-2"],
		};
		expect(decideDiagramInfoResponse(info, null)?.workGroupIds).toEqual(["wg-1", "wg-2"]);

		const empty = { ...baseDiagram, Name: "A", WorkGroupIds: ["", "  "] };
		expect(decideDiagramInfoResponse(empty, null)?.workGroupIds).toBeNull();
	});
});
