import { useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { useEditorStore } from "./store/editorStore";
import { useAutoBroadcast } from "./store/useAutoBroadcast";
import { useRemoteRequestResponder } from "./store/useRemoteRequestResponder";
import { setMonitorEnabled, subscribeMonitorRedock, subscribeWsEvents } from "./api/wsServer";
import { useMonitorStore } from "./store/monitorStore";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { EditorLayout } from "./components/EditorLayout";
import { MonitorDock } from "./components/Monitor/MonitorDock";

function App() {
	const setRemoteSelection = useEditorStore((s) => s.setRemoteSelection);
	const documentVersion = useEditorStore((s) => s.documentVersion);
	useAutoBroadcast();
	useRemoteRequestResponder();

	useEffect(() => {
		let unsub: (() => void) | undefined;
		(async () => {
			unsub = await subscribeWsEvents((ev) => {
				if (ev.type === "id-update") {
					setRemoteSelection({
						WorkGroupId: ev.message.WorkGroupId,
						WorkId: ev.message.WorkId,
						TrainId: ev.message.TrainId,
						receivedAt: Date.now(),
					});
				}
			});
		})();
		return () => unsub?.();
	}, [setRemoteSelection]);

	// 別ウィンドウのモニタから「アプリ内へ戻す」要求を受けたら、ドック位置を
	// 反映して開き直す。ストアはウィンドウ間で共有されないのでイベント経由。
	useEffect(() => {
		let disposed = false;
		let unsub: (() => void) | undefined;
		(async () => {
			const off = await subscribeMonitorRedock((position) => {
				const s = useMonitorStore.getState();
				s.setDock(position);
				s.setOpen(true);
				// 閉じゆくモニタウィンドウの cleanup が監視を false にし得るので、
				// ウィンドウが確実に閉じた後に再度有効化して取りこぼしを防ぐ。
				setTimeout(() => void setMonitorEnabled(true), 300);
			});
			if (disposed) {
				off();
				return;
			}
			unsub = off;
		})();
		return () => {
			disposed = true;
			unsub?.();
		};
	}, []);

	return (
		<ErrorBoundary
			fallbackRender={({ error }) => (
				<div style={{ padding: 16, color: "var(--danger)" }}>
					<h2>エディタでエラーが発生しました</h2>
					<pre>{String(error)}</pre>
				</div>
			)}
		>
			<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
				<ConnectionPanel />
				<div style={{ flex: 1, minHeight: 0 }}>
					<MonitorDock>
						{/* documentVersion を key にして、JSON を開き直したらツリーの展開状態や
						    編集ダイアログ等のローカル state を強制的にリセットする。 */}
						<div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
							<EditorLayout key={documentVersion} />
						</div>
					</MonitorDock>
				</div>
			</div>
		</ErrorBoundary>
	);
}

export default App;
