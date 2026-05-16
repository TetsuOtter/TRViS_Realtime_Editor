import { useCallback, useRef } from "react";
import { useMonitorStore } from "../../store/monitorStore";
import { useMonitorFeed } from "../../store/useMonitorFeed";
import { openMonitorWindow } from "../../api/wsServer";
import { MonitorPanel } from "./MonitorPanel";

/** マウントされている間だけ Rust 側の監視を有効化する。 */
function MonitorFeedRunner() {
	useMonitorFeed();
	return null;
}

interface Props {
	/** 監視対象のメイン領域 (エディタ) */
	children: React.ReactNode;
}

/**
 * 通信モニタをアプリ内にドック表示する。
 *   - 閉じている / 別ウィンドウモードのときは children をそのまま全面表示。
 *   - 右 / 左 / 下にドックするときは children と分割し、間にリサイズ用のつまみを置く。
 */
export function MonitorDock({ children }: Props) {
	const open = useMonitorStore((s) => s.open);
	const dock = useMonitorStore((s) => s.settings.dock);
	const panelSize = useMonitorStore((s) => s.settings.panelSize);
	const setOpen = useMonitorStore((s) => s.setOpen);
	const setDock = useMonitorStore((s) => s.setDock);
	const setPanelSize = useMonitorStore((s) => s.setPanelSize);

	const dragRef = useRef<{ start: number; size: number } | null>(null);

	const active = open && dock !== "window";
	const isRow = dock === "right" || dock === "left";

	const onResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragRef.current = {
				start: isRow ? e.clientX : e.clientY,
				size: panelSize,
			};
			const onMove = (ev: MouseEvent) => {
				const d = dragRef.current;
				if (!d) return;
				const pos = isRow ? ev.clientX : ev.clientY;
				const delta = pos - d.start;
				// 右/下ドックはパネルが終端側にあるので、ドラッグ方向と逆にサイズが増える。
				const sign = dock === "right" || dock === "bottom" ? -1 : 1;
				setPanelSize(d.size + delta * sign);
			};
			const onUp = () => {
				dragRef.current = null;
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
			};
			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[dock, isRow, panelSize, setPanelSize],
	);

	if (!active) {
		return <>{children}</>;
	}

	const editor = (
		<div key="editor" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
			{children}
		</div>
	);

	const resizer = (
		<div
			key="resizer"
			onMouseDown={onResizeStart}
			style={{
				flexShrink: 0,
				background: "var(--border)",
				cursor: isRow ? "col-resize" : "row-resize",
				...(isRow ? { width: 4 } : { height: 4 }),
			}}
		/>
	);

	const panel = (
		<div
			key="panel"
			style={{
				flexShrink: 0,
				...(isRow ? { width: panelSize } : { height: panelSize }),
				minWidth: 0,
				minHeight: 0,
			}}
		>
			<MonitorPanel
				variant="docked"
				onClose={() => setOpen(false)}
				onOpenWindow={() => {
					setDock("window");
					void openMonitorWindow();
				}}
			/>
		</div>
	);

	const order =
		dock === "left" || dock === "bottom" ? [panel, resizer, editor] : [editor, resizer, panel];

	return (
		<>
			<MonitorFeedRunner />
			<div
				style={{
					display: "flex",
					flexDirection: isRow ? "row" : "column",
					height: "100%",
					minHeight: 0,
				}}
			>
				{order}
			</div>
		</>
	);
}
