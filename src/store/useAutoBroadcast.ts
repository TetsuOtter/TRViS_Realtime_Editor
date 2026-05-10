import { useEffect, useRef } from "react";

import {
	broadcastAllWorkGroups,
	broadcastWorkGroup,
	sendInitialTimetableTo,
	subscribeWsEvents,
} from "../api/wsServer";
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
 *
 * 新規クライアント接続時は、その 1 クライアントだけに `Scope.All` の初期スナップショットを
 * 送る (既存クライアントの選択列車・駅 index・位置情報をリセットしないため、
 * `broadcast_timetable` ではなく `send_initial_timetable_to` を使う)。
 */
export function useAutoBroadcast() {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastBroadcastRef = useRef<unknown>(null);
	const inflightRef = useRef(false);

	useEffect(() => {
		const schedule = (force = false) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(async () => {
				timerRef.current = null;
				if (inflightRef.current) {
					schedule(force);
					return;
				}
				const { liveBroadcast, workGroups, selection } = useEditorStore.getState();
				if (!liveBroadcast) return;
				if (!force && lastBroadcastRef.current === workGroups) return;
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

		let unsubWs: (() => void) | undefined;
		(async () => {
			unsubWs = await subscribeWsEvents((ev) => {
				if (ev.type !== "client-connected") return;
				const { workGroups } = useEditorStore.getState();
				sendInitialTimetableTo(ev.clientId, workGroups).catch((e) => {
					console.error("sendInitialTimetableTo failed:", e);
				});
			});
		})();

		return () => {
			unsub();
			unsubWs?.();
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);
}
