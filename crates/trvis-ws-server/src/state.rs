//! サーバ全体で共有される状態とイベント定義。

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{broadcast, mpsc, Mutex};

use crate::messages::{ClientIdUpdateMessage, OutboundMessage};

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

/// サーバ-クライアント間で共有される状態のラッパ。
#[derive(Clone)]
pub struct SharedState {
	pub clients: Arc<Mutex<HashMap<String, ClientState>>>,
	/// 各接続クライアントへ送信を依頼するキュー (1接続=1senderにbroadcast)。
	pub outbound_senders: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<OutboundMessage>>>>,
	pub events: ServerEventSender,
}

impl SharedState {
	pub fn new() -> Self {
		let (events, _rx) = broadcast::channel(64);
		Self {
			clients: Arc::new(Mutex::new(HashMap::new())),
			outbound_senders: Arc::new(Mutex::new(HashMap::new())),
			events,
		}
	}

	pub fn subscribe(&self) -> ServerEventReceiver {
		self.events.subscribe()
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
