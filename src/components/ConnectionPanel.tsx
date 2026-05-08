import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import {
	startServer,
	stopServer,
	listLocalHosts,
	subscribeWsEvents,
	getTrvisAppLinkWs,
} from "../api/wsServer";
import type { ConnectionStatus } from "../types/trvis";

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
	const [activeHostIdx, setActiveHostIdx] = useState(0);
	const [copied, setCopied] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const activeHost = serverState.hosts[activeHostIdx] ?? "";
	const wsUrl = activeHost ? getTrvisAppLinkWs(activeHost, serverState.port) : "";

	useEffect(() => {
		if (!wsUrl || !canvasRef.current) return;
		QRCode.toCanvas(canvasRef.current, wsUrl, { width: 160, margin: 1 }).catch(() => {});
	}, [wsUrl]);

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
					setActiveHostIdx(0);
				} else if (ev.type === "stopped") {
					setServerState((s) => ({
						...s,
						status: "stopped",
						hosts: [],
						clientCount: 0,
					}));
					clientIds.clear();
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

	const handleCopy = useCallback(() => {
		if (!wsUrl) return;
		navigator.clipboard.writeText(wsUrl).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [wsUrl]);

	const isRunning =
		serverState.status === "listening" ||
		serverState.status === "client-connected" ||
		serverState.status === "starting";

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
				</div>
				{serverState.errorMsg && (
					<div style={{ fontSize: 11, color: "var(--danger)" }}>{serverState.errorMsg}</div>
				)}
			</div>

			{/* QRコードと接続URL */}
			{isRunning && serverState.hosts.length > 0 && (
				<>
					{/* ホストタブ */}
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						{serverState.hosts.length > 1 && (
							<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
								{serverState.hosts.map((h, i) => (
									<button
										key={h}
										onClick={() => setActiveHostIdx(i)}
										style={{
											padding: "2px 8px",
											fontSize: 11,
											border: "1px solid var(--border)",
											borderRadius: 4,
											background: i === activeHostIdx ? "var(--accent)" : "transparent",
											color: i === activeHostIdx ? "#fff" : "var(--text)",
										}}
									>
										{h}
									</button>
								))}
							</div>
						)}
						<div
							style={{
								fontSize: 11,
								color: "var(--text-muted)",
								fontFamily: "monospace",
								maxWidth: 340,
								wordBreak: "break-all",
							}}
						>
							{wsUrl}
						</div>
						<button
							onClick={handleCopy}
							style={{
								padding: "3px 10px",
								fontSize: 12,
								border: "1px solid var(--border)",
								borderRadius: 4,
								background: copied ? "#34c759" : "transparent",
								color: copied ? "#fff" : "var(--text)",
								width: "fit-content",
							}}
						>
							{copied ? "コピー完了" : "URLをコピー"}
						</button>
					</div>

					{/* QRコード */}
					<canvas ref={canvasRef} style={{ borderRadius: 4 }} />
				</>
			)}
		</div>
	);
}
