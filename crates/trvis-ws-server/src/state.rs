//! サーバ全体で共有される状態とイベント定義。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::{broadcast, mpsc, Mutex};

use crate::messages::{ClientIdUpdateMessage, OutboundMessage};

/// モニタフレームの向き。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MonitorDirection {
	/// クライアント → サーバ (受信)。
	In,
	/// サーバ → クライアント (送信)。
	Out,
}

/// 通信モニタ用に観測した 1 フレーム。実際にワイヤを流れた生 JSON 文字列をそのまま保持する。
#[derive(Debug, Clone)]
pub struct MonitorFrame {
	pub direction: MonitorDirection,
	pub client_id: String,
	pub json: String,
	/// UNIX epoch ミリ秒 (フレーム観測時刻)。
	pub ts_ms: i64,
}

fn now_epoch_ms() -> i64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|d| d.as_millis() as i64)
		.unwrap_or(0)
}

/// 個々のクライアント接続の状態。
#[derive(Debug, Clone, Default)]
pub struct ClientState {
	pub work_group_id: Option<String>,
	pub work_id: Option<String>,
	pub train_id: Option<String>,
}

/// サーバから上位レイヤ(UI/テスト) に通知されるイベント。
#[derive(Debug, Clone)]
pub enum ServerEvent {
	Started {
		port: u16,
		hosts: Vec<String>,
	},
	Stopped,
	ClientConnected {
		client_id: String,
	},
	ClientDisconnected {
		client_id: String,
	},
	/// クライアントが選択中のIDを更新したことを通知。
	/// エディタはこれを受けて「TRViSが現在表示中の列車」を更新する。
	IdUpdate {
		client_id: String,
		message: ClientIdUpdateMessage,
	},
	/// クライアントが `MessageType: "RequestServerInfo"` を送ってきた。
	/// 上位レイヤは ServerInfo を組み立てて返信する想定。
	RequestServerInfo {
		client_id: String,
	},
	/// クライアントが `MessageType: "RequestDiagramInfo"` を送ってきた。
	/// `diagram_id` が `None` の場合はカレントダイヤを要求している。
	RequestDiagramInfo {
		client_id: String,
		diagram_id: Option<String>,
	},
	Error {
		message: String,
	},
}

pub type ServerEventSender = broadcast::Sender<ServerEvent>;
pub type ServerEventReceiver = broadcast::Receiver<ServerEvent>;

pub type MonitorFrameSender = broadcast::Sender<MonitorFrame>;
pub type MonitorFrameReceiver = broadcast::Receiver<MonitorFrame>;

/// サーバ-クライアント間で共有される状態のラッパ。
#[derive(Clone)]
pub struct SharedState {
	pub clients: Arc<Mutex<HashMap<String, ClientState>>>,
	/// 各接続クライアントへ送信を依頼するキュー (1接続=1senderにbroadcast)。
	pub outbound_senders: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<OutboundMessage>>>>,
	pub events: ServerEventSender,
	/// 通信モニタ用フレームのチャネル。コントロールイベント (`events`) とは
	/// 別系統にして、高頻度な SyncedData 等が制御イベントを巻き込まないようにする。
	monitor_events: MonitorFrameSender,
	/// 通信モニタが有効かどうか。無効時は監視フレームを一切発火しない
	/// (モニタを閉じている間にフル Timetable JSON が流れ続けるのを防ぐ)。
	monitor_enabled: Arc<AtomicBool>,
}

impl SharedState {
	pub fn new() -> Self {
		let (events, _rx) = broadcast::channel(64);
		// SyncedData は 250ms × 接続数 で流れ得るのでバッファを厚めに取る。
		let (monitor_events, _mrx) = broadcast::channel(2048);
		Self {
			clients: Arc::new(Mutex::new(HashMap::new())),
			outbound_senders: Arc::new(Mutex::new(HashMap::new())),
			events,
			monitor_events,
			monitor_enabled: Arc::new(AtomicBool::new(false)),
		}
	}

	pub fn subscribe(&self) -> ServerEventReceiver {
		self.events.subscribe()
	}

	/// 通信モニタフレームを購読する。
	pub fn subscribe_monitor(&self) -> MonitorFrameReceiver {
		self.monitor_events.subscribe()
	}

	/// 通信モニタの有効/無効を切り替える。
	pub fn set_monitor_enabled(&self, enabled: bool) {
		self.monitor_enabled.store(enabled, Ordering::Relaxed);
	}

	pub fn is_monitor_enabled(&self) -> bool {
		self.monitor_enabled.load(Ordering::Relaxed)
	}

	/// モニタが有効なときだけ 1 フレームを発火する。`json` は遅延構築できるよう
	/// クロージャで受け取り、無効時はクローン/組み立てコストを払わない。
	pub fn emit_monitor(
		&self,
		direction: MonitorDirection,
		client_id: &str,
		json: impl FnOnce() -> String,
	) {
		if !self.monitor_enabled.load(Ordering::Relaxed) {
			return;
		}
		let _ = self.monitor_events.send(MonitorFrame {
			direction,
			client_id: client_id.to_string(),
			json: json(),
			ts_ms: now_epoch_ms(),
		});
	}

	/// 全クライアントに送信。
	pub async fn broadcast(&self, message: OutboundMessage) {
		let senders = self.outbound_senders.lock().await;
		for sender in senders.values() {
			let _ = sender.send(message.clone());
		}
	}

	/// 指定クライアントだけに送信。送信先が存在しなければ `false` を返す。
	pub async fn send_to(&self, client_id: &str, message: OutboundMessage) -> bool {
		let senders = self.outbound_senders.lock().await;
		match senders.get(client_id) {
			Some(sender) => sender.send(message).is_ok(),
			None => false,
		}
	}
}

impl Default for SharedState {
	fn default() -> Self {
		Self::new()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn emit_monitor_is_gated_by_enabled_flag() {
		let state = SharedState::new();
		let mut rx = state.subscribe_monitor();

		// 既定 (無効) では何も流れない。json クロージャも評価されないこと。
		let mut called = false;
		state.emit_monitor(MonitorDirection::Out, "c1", || {
			called = true;
			"{}".to_string()
		});
		assert!(!called, "無効時は json クロージャを評価しないこと");
		assert!(rx.try_recv().is_err(), "無効時はフレームを発火しないこと");

		// 有効化すると流れる。
		state.set_monitor_enabled(true);
		state.emit_monitor(MonitorDirection::In, "c2", || {
			r#"{"MessageType":"X"}"#.to_string()
		});
		let frame = rx.try_recv().expect("有効化後はフレームが届くこと");
		assert_eq!(frame.direction, MonitorDirection::In);
		assert_eq!(frame.client_id, "c2");
		assert_eq!(frame.json, r#"{"MessageType":"X"}"#);

		// 再度無効化すると止まる。
		state.set_monitor_enabled(false);
		state.emit_monitor(MonitorDirection::Out, "c3", || "{}".to_string());
		assert!(rx.try_recv().is_err(), "無効化後は再びフレームが止まること");
	}
}
