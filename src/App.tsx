import { useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { useEditorStore } from "./store/editorStore";
import { useAutoBroadcast } from "./store/useAutoBroadcast";
import { subscribeWsEvents } from "./api/wsServer";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { EditorLayout } from "./components/EditorLayout";

function App() {
	const setRemoteSelection = useEditorStore((s) => s.setRemoteSelection);
	useAutoBroadcast();

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
					<EditorLayout />
				</div>
			</div>
		</ErrorBoundary>
	);
}

export default App;
