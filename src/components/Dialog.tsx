import { useEffect } from "react";

interface Props {
	open: boolean;
	title: string;
	onClose: () => void;
	children: React.ReactNode;
	width?: number;
	/** ビューポート全体に広げる。`width` は無視される。 */
	fullscreen?: boolean;
}

export function Dialog({ open, title, onClose, children, width = 480, fullscreen = false }: Props) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={title}
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.4)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 2000,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: fullscreen ? "100vw" : width,
					height: fullscreen ? "100vh" : undefined,
					maxWidth: fullscreen ? "100vw" : "90vw",
					maxHeight: fullscreen ? "100vh" : "85vh",
					background: "var(--bg)",
					border: fullscreen ? "none" : "1px solid var(--border)",
					borderRadius: fullscreen ? 0 : 8,
					boxShadow: fullscreen ? "none" : "0 10px 40px rgba(0,0,0,0.3)",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "10px 14px",
						borderBottom: "1px solid var(--border)",
						background: "var(--bg-panel)",
					}}
				>
					<span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="閉じる"
						style={{
							border: "none",
							background: "none",
							fontSize: 18,
							cursor: "pointer",
							color: "var(--text-muted)",
							padding: "0 4px",
							lineHeight: 1,
						}}
					>
						×
					</button>
				</div>
				<div
					style={
						fullscreen
							? // フルスクリーンでは body を flex column にして、子要素が
								// 残り領域を `flex: 1` で埋められるようにする (CodeMirror 等)。
								{
									flex: 1,
									minHeight: 0,
									display: "flex",
									flexDirection: "column",
								}
							: { overflowY: "auto", flex: 1 }
					}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
