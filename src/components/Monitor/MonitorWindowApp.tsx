import { ErrorBoundary } from "react-error-boundary";
import { useMonitorFeed } from "../../store/useMonitorFeed";
import { redockMonitor } from "../../api/wsServer";
import { MonitorPanel } from "./MonitorPanel";

/**
 * 別ウィンドウ (`index.html#monitor`) で読み込まれたときのルート。
 * 通信モニタを単独でビューポート全面に表示する。
 */
export function MonitorWindowApp() {
	useMonitorFeed();
	return (
		<ErrorBoundary
			fallbackRender={({ error }) => (
				<div style={{ padding: 16, color: "var(--danger)" }}>
					<h2>モニタでエラーが発生しました</h2>
					<pre>{String(error)}</pre>
				</div>
			)}
		>
			<div style={{ height: "100%" }}>
				<MonitorPanel variant="window" onRedock={(pos) => void redockMonitor(pos)} />
			</div>
		</ErrorBoundary>
	);
}
