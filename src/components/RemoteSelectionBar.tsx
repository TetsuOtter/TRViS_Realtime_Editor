import { useEditorStore, selectActiveWorkGroup } from "../store/editorStore";
import { broadcastWorkGroup } from "../api/wsServer";

export function RemoteSelectionBar() {
	const remoteSelection = useEditorStore((s) => s.remoteSelection);
	const followRemoteSelection = useEditorStore((s) => s.followRemoteSelection);
	const workGroups = useEditorStore((s) => s.workGroups);
	const activeWorkGroup = useEditorStore(selectActiveWorkGroup);

	const remoteTrain = remoteSelection?.TrainId
		? workGroups
				.flatMap((wg) => wg.Works.flatMap((w) => w.Trains.map((t) => ({ t, wg, w }))))
				.find(({ t }) => t.Id === remoteSelection.TrainId)
		: null;

	const handleBroadcast = async () => {
		if (!activeWorkGroup) return;
		try {
			await broadcastWorkGroup(activeWorkGroup);
		} catch (e) {
			console.error("broadcastWorkGroup failed:", e);
		}
	};

	return (
		<div
			style={{
				padding: "6px 12px",
				background: "var(--bg-panel)",
				borderBottom: "1px solid var(--border)",
				display: "flex",
				alignItems: "center",
				gap: 12,
				flexWrap: "wrap",
				fontSize: 12,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<span style={{ color: "var(--text-muted)", fontWeight: 600 }}>TRViS表示中:</span>
				{remoteSelection ? (
					<span>
						{remoteTrain
							? `${remoteTrain.t.TrainNumber}${remoteTrain.t.Destination ? ` → ${remoteTrain.t.Destination}` : ""} (${remoteTrain.wg.Name} / ${remoteTrain.w.Name})`
							: `TrainId: ${remoteSelection.TrainId ?? "(不明)"}`}
					</span>
				) : (
					<span style={{ color: "var(--text-muted)" }}>未接続</span>
				)}
			</div>

			{remoteSelection && (
				<button
					onClick={followRemoteSelection}
					style={{
						padding: "3px 10px",
						fontSize: 12,
						border: "1px solid var(--accent)",
						borderRadius: 4,
						background: "transparent",
						color: "var(--accent)",
						cursor: "pointer",
					}}
				>
					TRViSで表示中の列車に移動
				</button>
			)}

			<button
				onClick={handleBroadcast}
				disabled={!activeWorkGroup}
				title="この仕業群をTRViSに配信します (TRViS本体側に対応プロトコル拡張が必要)"
				style={{
					padding: "3px 10px",
					fontSize: 12,
					border: "1px solid var(--border)",
					borderRadius: 4,
					background: "transparent",
					color: activeWorkGroup ? "var(--text)" : "var(--text-muted)",
					cursor: activeWorkGroup ? "pointer" : "not-allowed",
				}}
			>
				この仕業群をTRViSに配信 ※要プロトコル拡張
			</button>
		</div>
	);
}
