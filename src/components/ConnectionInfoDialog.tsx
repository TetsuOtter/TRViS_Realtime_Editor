import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Dialog } from "./Dialog";
import { getTrvisAppLinkWs } from "../api/wsServer";

interface Props {
	open: boolean;
	onClose: () => void;
	hosts: string[];
	port: number;
}

/**
 * TRViS から接続するための WebSocket URL と、その QR コードを表示するダイアログ。
 *
 * - 複数の hosts (LAN / loopback / 別 NIC) がある場合はタブで切り替え可能。
 * - canvas は open 時のみ DOM に存在するので、QR 描画 effect は `open` を依存に含める。
 */
export function ConnectionInfoDialog({ open, onClose, hosts, port }: Props) {
	const [activeHostIdx, setActiveHostIdx] = useState(0);
	const [copied, setCopied] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// hosts が変動して範囲外になったら 0 に戻す。
	const safeIdx = activeHostIdx < hosts.length ? activeHostIdx : 0;
	const activeHost = hosts[safeIdx] ?? "";
	const wsUrl = activeHost ? getTrvisAppLinkWs(activeHost, port) : "";

	useEffect(() => {
		if (!open) {
			setCopied(false);
			return;
		}
		if (!wsUrl || !canvasRef.current) return;
		QRCode.toCanvas(canvasRef.current, wsUrl, { width: 240, margin: 1 }).catch(() => {});
	}, [open, wsUrl]);

	const handleCopy = () => {
		if (!wsUrl) return;
		navigator.clipboard.writeText(wsUrl).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	};

	return (
		<Dialog open={open} title="接続情報 (URL / QR)" onClose={onClose} width={420}>
			<div
				style={{
					padding: 16,
					display: "flex",
					flexDirection: "column",
					gap: 12,
					alignItems: "center",
				}}
			>
				{hosts.length > 1 && (
					<div
						style={{
							display: "flex",
							gap: 4,
							flexWrap: "wrap",
							justifyContent: "center",
						}}
					>
						{hosts.map((h, i) => (
							<button
								key={h}
								onClick={() => setActiveHostIdx(i)}
								style={{
									padding: "4px 10px",
									fontSize: 12,
									border: "1px solid var(--border)",
									borderRadius: 4,
									background: i === safeIdx ? "var(--accent)" : "transparent",
									color: i === safeIdx ? "#fff" : "var(--text)",
									cursor: "pointer",
								}}
							>
								{h}
							</button>
						))}
					</div>
				)}

				<canvas ref={canvasRef} style={{ borderRadius: 4 }} />

				<div
					style={{
						fontSize: 12,
						color: "var(--text)",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						wordBreak: "break-all",
						maxWidth: 360,
						textAlign: "center",
					}}
				>
					{wsUrl}
				</div>

				<button
					type="button"
					onClick={handleCopy}
					style={{
						padding: "5px 14px",
						fontSize: 13,
						border: "1px solid var(--border)",
						borderRadius: 4,
						background: copied ? "#34c759" : "var(--bg-panel)",
						color: copied ? "#fff" : "var(--text)",
						cursor: "pointer",
					}}
				>
					{copied ? "コピー完了" : "URLをコピー"}
				</button>
			</div>
		</Dialog>
	);
}
