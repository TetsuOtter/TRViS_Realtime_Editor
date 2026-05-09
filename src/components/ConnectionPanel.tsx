import { useEffect, useState, useCallback } from "react";
import { startServer, stopServer, listLocalHosts, subscribeWsEvents } from "../api/wsServer";
import type { ConnectionStatus } from "../types/trvis";
import { SyncedDataPanel } from "./SyncedDataPanel";
import { ConnectionInfoDialog } from "./ConnectionInfoDialog";

const DEFAULT_PORT = 23519;

type ServerState = {
	status: ConnectionStatus;
	port: number;
	hosts: string[];
	clientCount: number;
	errorMsg: string;
};

export function ConnectionPanel() {
	const [serverState, setServerState] = useState<ServerState>({
		status: "stopped",
		port: DEFAULT_PORT,
		hosts: [],
		clientCount: 0,
		errorMsg: "",
	});
	const [infoOpen, setInfoOpen] = useState(false);

	useEffect(() => {
		let unsub: (() => void) | undefined;
		const clientIds = new Set<string>();
		(async () => {
			unsub = await subscribeWsEvents((ev) => {
				if (ev.type === "started") {
					setServerState((s) => ({
						...s,
						status: "listening",
						port: ev.port,
						hosts: ev.hosts,
						errorMsg: "",
					}));
				} else if (ev.type === "stopped") {
					setServerState((s) => ({
						...s,
						status: "stopped",
						hosts: [],
						clientCount: 0,
					}));
					clientIds.clear();
					setInfoOpen(false);
				} else if (ev.type === "client-connected") {
					clientIds.add(ev.clientId);
					setServerState((s) => ({
						...s,
						status: "client-connected",
						clientCount: clientIds.size,
					}));
				} else if (ev.type === "client-disconnected") {
					clientIds.delete(ev.clientId);
					setServerState((s) => ({
						...s,
						status: clientIds.size > 0 ? "client-connected" : "listening",
						clientCount: clientIds.size,
					}));
				} else if (ev.type === "error") {
					setServerState((s) => ({
						...s,
						status: "error",
						errorMsg: ev.message,
					}));
				}
			});
		})();
		return () => unsub?.();
	}, []);

	const handleStart = useCallback(async () => {
		try {
			setServerState((s) => ({ ...s, status: "starting", errorMsg: "" }));
			const hosts = await listLocalHosts();
			await startServer({ port: DEFAULT_PORT });
			if (serverState.hosts.length === 0) {
				setServerState((s) => ({ ...s, hosts }));
			}
		} catch (e) {
			setServerState((s) => ({
				...s,
				status: "error",
				errorMsg: String(e),
			}));
		}
	}, [serverState.hosts.length]);

	const handleStop = useCallback(async () => {
		await stopServer();
	}, []);

	const isRunning =
		serverState.status === "listening" ||
		serverState.status === "client-connected" ||
		serverState.status === "starting";

	const canShowInfo = isRunning && serverState.hosts.length > 0;

	const statusLabel: Record<ConnectionStatus, string> = {
		stopped: "停止中",
		starting: "起動中...",
		listening: "待機中",
		"client-connected": "接続中",
		error: "エラー",
	};

	const statusColor: Record<ConnectionStatus, string> = {
		stopped: "var(--text-muted)",
		starting: "var(--accent)",
		listening: "#34c759",
		"client-connected": "#34c759",
		error: "var(--danger)",
	};

	return (
		<div
			style={{
				background: "var(--bg-panel)",
				borderBottom: "1px solid var(--border)",
				padding: "8px 16px",
				display: "flex",
				alignItems: "flex-start",
				gap: 16,
				flexWrap: "wrap",
			}}
		>
			{/* サーバ制御 */}
			<div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span
						style={{
							width: 10,
							height: 10,
							borderRadius: "50%",
							background: statusColor[serverState.status],
							display: "inline-block",
						}}
					/>
					<span style={{ fontSize: 13, fontWeight: 600 }}>{statusLabel[serverState.status]}</span>
					{serverState.status === "client-connected" && (
						<span style={{ fontSize: 12, color: "var(--text-muted)" }}>
							({serverState.clientCount}台接続中)
						</span>
					)}
				</div>
				<div style={{ display: "flex", gap: 6 }}>
					<button
						onClick={handleStart}
						disabled={isRunning}
						style={{
							padding: "4px 12px",
							background: isRunning ? "var(--border)" : "var(--accent)",
							color: isRunning ? "var(--text-muted)" : "#fff",
							border: "none",
							borderRadius: 6,
							fontSize: 13,
						}}
					>
						起動
					</button>
					<button
						onClick={handleStop}
						disabled={!isRunning}
						style={{
							padding: "4px 12px",
							background: !isRunning ? "var(--border)" : "var(--danger)",
							color: !isRunning ? "var(--text-muted)" : "#fff",
							border: "none",
							borderRadius: 6,
							fontSize: 13,
						}}
					>
						停止
					</button>
					<button
						onClick={() => setInfoOpen(true)}
						disabled={!canShowInfo}
						style={{
							padding: "4px 12px",
							background: !canShowInfo ? "var(--border)" : "var(--bg)",
							color: !canShowInfo ? "var(--text-muted)" : "var(--text)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							fontSize: 13,
							cursor: !canShowInfo ? "default" : "pointer",
						}}
						title="接続用 URL と QR コードをダイアログで表示"
					>
						URL/QR
					</button>
				</div>
				{serverState.errorMsg && (
					<div
						style={{
							fontSize: 11,
							color: "var(--danger)",
							maxWidth: 200,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
						title={serverState.errorMsg}
					>
						{serverState.errorMsg}
					</div>
				)}
			</div>

			{/* 同期データ (右端) */}
			<div style={{ marginLeft: "auto", flex: "1 1 240px", minWidth: 0, maxWidth: 360 }}>
				<SyncedDataPanel compact />
			</div>

			<ConnectionInfoDialog
				open={infoOpen && canShowInfo}
				onClose={() => setInfoOpen(false)}
				hosts={serverState.hosts}
				port={serverState.port}
			/>
		</div>
	);
}
