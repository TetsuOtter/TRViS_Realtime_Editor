import { useEffect, useRef } from "react";

import { broadcastAllWorkGroups } from "../api/wsServer";
import { useEditorStore } from "./editorStore";

const DEBOUNCE_MS = 300;

/**
 * `liveBroadcast` が ON の間、`workGroups` の変化を検知して
 * デバウンス付きで全データを TRViS に配信する。
 *
 * 現状の TRViS は同一スコープの Timetable 更新を受信するとセレクションを
 * 初期化するため、UX としてのリアルタイム編集は TRViS 側の修正
 * (TetsuOtter/TRViS Issue #214) 後に有効化される。エディタ側ロジックは
 * 先行して用意し、TRViS 修正後に何もせず動くようにしておく。
 */
export function useAutoBroadcast() {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastBroadcastRef = useRef<unknown>(null);
	const inflightRef = useRef(false);

	useEffect(() => {
		const schedule = () => {
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(async () => {
				timerRef.current = null;
				if (inflightRef.current) {
					schedule();
					return;
				}
				const { liveBroadcast, workGroups } = useEditorStore.getState();
				if (!liveBroadcast) return;
				if (lastBroadcastRef.current === workGroups) return;
				lastBroadcastRef.current = workGroups;
				inflightRef.current = true;
				try {
					await broadcastAllWorkGroups(workGroups);
				} catch (e) {
					console.error("auto broadcast failed:", e);
				} finally {
					inflightRef.current = false;
				}
			}, DEBOUNCE_MS);
		};

		const unsub = useEditorStore.subscribe((state, prev) => {
			if (!state.liveBroadcast) return;
			const justEnabled = state.liveBroadcast && !prev.liveBroadcast;
			if (justEnabled || state.workGroups !== prev.workGroups) {
				schedule();
			}
		});

		return () => {
			unsub();
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);
}
