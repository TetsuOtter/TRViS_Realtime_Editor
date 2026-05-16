/**
 * 通信モニタが表示されている間だけ Rust 側の監視を有効化し、
 * `ws-monitor` フレームをストアへ流し込むフック。
 *
 * - マウント中のみ `set_monitor_enabled(true)`、アンマウントで `false`。
 * - Rust 側 (`AppState`) が監視意図を保持し、サーバの起動/停止を跨いでも
 *   起動時に再適用するため、フロントは「サーバ再起動の貼り直し」を気にしなくてよい。
 */

import { useEffect } from "react";

import { setMonitorEnabled, subscribeWsMonitor } from "../api/wsServer";
import { useMonitorStore } from "./monitorStore";

export function useMonitorFeed() {
	const pushFrame = useMonitorStore((s) => s.pushFrame);
	const pushSystem = useMonitorStore((s) => s.pushSystem);

	useEffect(() => {
		let disposed = false;
		let off: (() => void) | undefined;

		void setMonitorEnabled(true);

		(async () => {
			const unsub = await subscribeWsMonitor((ev) => {
				if (ev.type === "frame") {
					pushFrame(ev);
				} else if (ev.type === "lagged") {
					pushSystem(`(モニタのバッファが溢れ ${ev.skipped} 件スキップされました)`);
				}
			});
			if (disposed) {
				unsub();
				return;
			}
			off = unsub;
		})();

		return () => {
			disposed = true;
			void setMonitorEnabled(false);
			off?.();
		};
	}, [pushFrame, pushSystem]);
}
