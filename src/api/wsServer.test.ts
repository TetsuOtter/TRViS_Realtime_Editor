import { describe, it, expect } from "vitest";
import { getTrvisAppLinkWs, buildScopeAllTimetable } from "./wsServer";
import type { WorkGroupData } from "../types/trvis";

describe("wsServer utilities", () => {
	describe("getTrvisAppLinkWs", () => {
		it("generates a trvis:// URL with the given host and port", () => {
			const url = getTrvisAppLinkWs("192.168.1.1", 23519);
			expect(url).toBe("trvis://app/open/json?path=ws://192.168.1.1:23519/ws");
		});

		it("works with localhost", () => {
			const url = getTrvisAppLinkWs("localhost", 8080);
			expect(url).toBe("trvis://app/open/json?path=ws://localhost:8080/ws");
		});

		it("works with IPv6-style host", () => {
			const url = getTrvisAppLinkWs("::1", 23519);
			expect(url).toBe("trvis://app/open/json?path=ws://::1:23519/ws");
		});
	});

	describe("buildScopeAllTimetable", () => {
		it("returns a Timetable message with MessageType set", () => {
			const wgs: WorkGroupData[] = [{ Id: "wg1", Name: "G1", Works: [] }];
			const msg = buildScopeAllTimetable(wgs);
			expect(msg.MessageType).toBe("Timetable");
		});

		it("includes the workGroups as Data", () => {
			const wgs: WorkGroupData[] = [{ Id: "wg1", Name: "G1", Works: [] }];
			const msg = buildScopeAllTimetable(wgs);
			expect(msg.Data).toBe(wgs);
		});

		it("has no WorkGroupId / WorkId / TrainId (All scope)", () => {
			const msg = buildScopeAllTimetable([]);
			expect(msg.WorkGroupId).toBeUndefined();
			expect(msg.WorkId).toBeUndefined();
			expect(msg.TrainId).toBeUndefined();
		});

		it("works with an empty array", () => {
			const msg = buildScopeAllTimetable([]);
			expect(Array.isArray(msg.Data)).toBe(true);
			expect((msg.Data as WorkGroupData[]).length).toBe(0);
		});

		it("works with multiple WorkGroups", () => {
			const wgs: WorkGroupData[] = [
				{ Id: "wg1", Name: "G1", Works: [] },
				{ Id: "wg2", Name: "G2", Works: [] },
			];
			const msg = buildScopeAllTimetable(wgs);
			expect((msg.Data as WorkGroupData[]).length).toBe(2);
		});
	});
});
