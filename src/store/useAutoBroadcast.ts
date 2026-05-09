import { useEffect, useRef } from "react";

import { broadcastAllWorkGroups, broadcastWorkGroup } from "../api/wsServer";
import { useEditorStore } from "./editorStore";

const DEBOUNCE_MS = 300;

/**
 * `liveBroadcast` が ON の間、`workGroups` の変化を検知して
 * デバウンス付きで TRViS に配信する。
 *
 * TRViS 本体は #214 対応により、`Scope.WorkGroup` / `Scope.Work` / `Scope.Train`
 * の Timetable 更新では選択中の Train / 駅 index / 位置情報を維持して再描画する
 * (`Scope.All` のみ位置情報を全リセットする)。リアルタイム編集の UX を成立させる
 * ため、選択中の WorkGroup がある場合は WorkGroup スコープで配信し、
 * 選択が無い (= TRViS が表示中の WorkGroup を特定できない) 場合のみ
 * `Scope.All` にフォールバックする。
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
				const { liveBroadcast, workGroups, selection } = useEditorStore.getState();
				if (!liveBroadcast) return;
				if (lastBroadcastRef.current === workGroups) return;
				lastBroadcastRef.current = workGroups;
				inflightRef.current = true;
				try {
					const activeWg = selection.workGroupId
						? workGroups.find((wg) => wg.Id === selection.workGroupId)
						: undefined;
					if (activeWg) {
						await broadcastWorkGroup(activeWg);
					} else {
						await broadcastAllWorkGroups(workGroups);
					}
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
