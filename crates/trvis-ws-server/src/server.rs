//! WebSocket サーバ本体。
//!
//! 仕様 (TRViS 本体の WebSocketNetworkSyncService / ReferenceServer と互換):
//!   - `ws://<host>:<port>/ws` で WebSocket を受け付ける。
//!   - 接続直後、上位から提供された初期 Timetable があればそれを送る。
//!   - クライアント→サーバ メッセージのうち `MessageType` を持つものは無視
//!     (初期実装では IdUpdate のみ処理する)。
//!   - クライアントから ID 更新メッセージが来たら `ServerEvent::IdUpdate` を発火する。
//!     ID 更新メッセージは「現時点で非nullな ID のみを含むスナップショット」として
//!     送られてくる (TRViS 本体クライアントの SendIdUpdateAsync 仕様)。
//!     上位レイヤは省略フィールドを「クリアされた」と解釈する想定。

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

use crate::messages::{
	CachedSyncedData, ClientIdUpdateMessage, OutboundMessage, ServerSyncedDataMessage,
	ServerTimetableMessage,
};
use crate::state::{ClientState, ServerEvent, SharedState};

#[derive(Debug, Clone)]
pub struct ServerOptions {
	pub host: String,
	pub port: u16,
	/// SyncedData の自動送信間隔。`None` なら自動送信しない。
	pub sync_interval: Option<Duration>,
}

impl Default for ServerOptions {
	fn default() -> Self {
		Self {
			host: "0.0.0.0".to_string(),
			port: 23519, // TRViS の慣例値からは離した適当なデフォルト
			sync_interval: Some(Duration::from_millis(250)),
		}
	}
}

#[derive(Clone)]
pub struct ServerHandle {
	pub state: SharedState,
	pub bound_port: u16,
	/// 接続直後に送る Timetable メッセージのキャッシュ。
	pub initial_timetable: Arc<Mutex<Option<ServerTimetableMessage>>>,
	/// 最新の SyncedData (送信前のキャッシュ)。`None` なら送信しない。
	/// `auto_time_ms = true` の場合、`time_ms` は再送毎に wall-clock で上書きされる。
	pub latest_sync: Arc<Mutex<Option<CachedSyncedData>>>,
	shutdown_tx: mpsc::Sender<()>,
}

impl ServerHandle {
	pub async fn shutdown(&self) {
		let _ = self.shutdown_tx.send(()).await;
	}

	pub async fn set_initial_timetable(&self, msg: Option<ServerTimetableMessage>) {
		*self.initial_timetable.lock().await = msg;
	}

	pub async fn set_latest_sync(&self, cached: Option<CachedSyncedData>) {
		*self.latest_sync.lock().await = cached;
	}

	pub async fn broadcast_timetable(&self, msg: ServerTimetableMessage) {
		self.state.broadcast(OutboundMessage::Timetable(msg)).await;
	}

	pub async fn broadcast_sync(&self, msg: ServerSyncedDataMessage) {
		self.state.broadcast(OutboundMessage::SyncedData(msg)).await;
	}
}

/// サーバを起動する。
pub async fn start(options: ServerOptions) -> Result<ServerHandle> {
	let addr: SocketAddr = format!("{}:{}", options.host, options.port).parse()?;
	let listener = TcpListener::bind(addr)
		.await
		.with_context(|| format!("WebSocketサーバのbindに失敗: {addr}"))?;
	let bound_port = listener.local_addr()?.port();

	let state = SharedState::new();
	let initial_timetable = Arc::new(Mutex::new(None::<ServerTimetableMessage>));
	let latest_sync = Arc::new(Mutex::new(None::<CachedSyncedData>));
	let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

	let _ = state.events.send(ServerEvent::Started {
		port: bound_port,
		hosts: detect_hosts(&options.host),
	});

	// accept loop
	{
		let state = state.clone();
		let initial_timetable = initial_timetable.clone();
		let latest_sync = latest_sync.clone();
		let sync_interval = options.sync_interval;
		tokio::spawn(async move {
			loop {
				tokio::select! {
						biased;
						_ = shutdown_rx.recv() => {
								let _ = state.events.send(ServerEvent::Stopped);
								break;
						}
						accept = listener.accept() => {
								match accept {
										Ok((stream, peer)) => {
												let state = state.clone();
												let initial_timetable = initial_timetable.clone();
												let latest_sync = latest_sync.clone();
												tokio::spawn(async move {
														if let Err(e) = handle_connection(
																state.clone(),
																stream,
																peer,
																initial_timetable,
																latest_sync,
																sync_interval,
														)
														.await
														{
																let _ = state.events.send(ServerEvent::Error {
																		message: format!("connection error: {e}"),
																});
														}
												});
										}
										Err(e) => {
												let _ = state.events.send(ServerEvent::Error {
														message: format!("accept error: {e}"),
												});
												tokio::time::sleep(Duration::from_millis(100)).await;
										}
								}
						}
				}
			}
		});
	}

	Ok(ServerHandle {
		state,
		bound_port,
		initial_timetable,
		latest_sync,
		shutdown_tx,
	})
}

async fn handle_connection(
	state: SharedState,
	stream: TcpStream,
	peer: SocketAddr,
	initial_timetable: Arc<Mutex<Option<ServerTimetableMessage>>>,
	latest_sync: Arc<Mutex<Option<CachedSyncedData>>>,
	sync_interval: Option<Duration>,
) -> Result<()> {
	let _ = peer;
	// パスは `/ws` のみ受け入れるが、tungstenite::accept_async は path checkを行わないため
	// 簡素化のためここでは検証しない (TRViS.ReferenceServer も任意パスを受理する)。
	let ws_stream = tokio_tungstenite::accept_async(stream).await?;

	let client_id = Uuid::new_v4().to_string();
	state
		.clients
		.lock()
		.await
		.insert(client_id.clone(), ClientState::default());

	let (outbound_tx, mut outbound_rx) = mpsc::unbounded_channel::<OutboundMessage>();
	state
		.outbound_senders
		.lock()
		.await
		.insert(client_id.clone(), outbound_tx.clone());

	let _ = state.events.send(ServerEvent::ClientConnected {
		client_id: client_id.clone(),
	});

	// 初期 Timetable を送信
	if let Some(ref msg) = *initial_timetable.lock().await {
		let _ = outbound_tx.send(OutboundMessage::Timetable(msg.clone()));
	}

	let (mut ws_sink, mut ws_stream) = ws_stream.split();

	// 送信ループ
	let send_task = {
		let client_id = client_id.clone();
		let state = state.clone();
		tokio::spawn(async move {
			while let Some(msg) = outbound_rx.recv().await {
				let json = match msg.to_json_string() {
					Ok(s) => s,
					Err(e) => {
						let _ = state.events.send(ServerEvent::Error {
							message: format!("serialize error: {e}"),
						});
						continue;
					}
				};
				if let Err(e) = ws_sink.send(Message::Text(json.into())).await {
					let _ = state.events.send(ServerEvent::Error {
						message: format!("send error to {client_id}: {e}"),
					});
					break;
				}
			}
			let _ = ws_sink.close().await;
		})
	};

	// SyncedData 自動送信
	let sync_task = if let Some(interval) = sync_interval {
		let outbound_tx = outbound_tx.clone();
		let latest_sync = latest_sync.clone();
		Some(tokio::spawn(async move {
			let mut ticker = tokio::time::interval(interval);
			ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
			loop {
				ticker.tick().await;
				let snapshot = latest_sync.lock().await.clone();
				if let Some(cached) = snapshot {
					let msg = cached.materialize();
					if outbound_tx.send(OutboundMessage::SyncedData(msg)).is_err() {
						break;
					}
				}
			}
		}))
	} else {
		None
	};

	// 受信ループ
	while let Some(message) = ws_stream.next().await {
		let message = match message {
			Ok(m) => m,
			Err(e) => {
				let _ = state.events.send(ServerEvent::Error {
					message: format!("recv error from {client_id}: {e}"),
				});
				break;
			}
		};

		match message {
			Message::Text(text) => {
				process_client_text(&state, &client_id, text.as_str()).await;
			}
			Message::Close(_) => break,
			Message::Ping(_) | Message::Pong(_) | Message::Frame(_) | Message::Binary(_) => {}
		}
	}

	// クリーンアップ
	state.outbound_senders.lock().await.remove(&client_id);
	state.clients.lock().await.remove(&client_id);
	let _ = state.events.send(ServerEvent::ClientDisconnected {
		client_id: client_id.clone(),
	});

	if let Some(t) = sync_task {
		t.abort();
	}
	let _ = send_task.await;
	Ok(())
}

async fn process_client_text(state: &SharedState, client_id: &str, text: &str) {
	let parsed: Value = match serde_json::from_str(text) {
		Ok(v) => v,
		Err(_) => return,
	};

	// `MessageType` がある場合は要求メッセージとしてルーティングする。
	// TRViS 本体側 (commit 8c101e4 以降) は次の要求を送ってくる:
	//   - {"MessageType":"RequestServerInfo"}
	//   - {"MessageType":"RequestDiagramInfo","DiagramId":...}  (DiagramId は省略可)
	// その他の MessageType は将来拡張用として無視する (エコーバック等の安全側倒し)。
	if let Some(message_type) = parsed.get("MessageType").and_then(|v| v.as_str()) {
		match message_type {
			"RequestServerInfo" => {
				let _ = state.events.send(ServerEvent::RequestServerInfo {
					client_id: client_id.to_string(),
				});
			}
			"RequestDiagramInfo" => {
				let diagram_id = parsed
					.get("DiagramId")
					.and_then(|v| v.as_str())
					.map(|s| s.to_string());
				let _ = state.events.send(ServerEvent::RequestDiagramInfo {
					client_id: client_id.to_string(),
					diagram_id,
				});
			}
			_ => {}
		}
		return;
	}

	let id_update: ClientIdUpdateMessage = match serde_json::from_value(parsed) {
		Ok(v) => v,
		Err(_) => return,
	};

	{
		let mut clients = state.clients.lock().await;
		if let Some(client) = clients.get_mut(client_id) {
			if id_update.work_group_id.is_some() {
				client.work_group_id = id_update.work_group_id.clone();
			}
			if id_update.work_id.is_some() {
				client.work_id = id_update.work_id.clone();
			}
			if id_update.train_id.is_some() {
				client.train_id = id_update.train_id.clone();
			}
		}
	}

	let _ = state.events.send(ServerEvent::IdUpdate {
		client_id: client_id.to_string(),
		message: id_update,
	});
}

/// 0.0.0.0/:: でlistenしている場合に、QRコードに焼き込むためのIPv4候補を列挙する。
fn detect_hosts(bind_host: &str) -> Vec<String> {
	if bind_host != "0.0.0.0" && !bind_host.is_empty() {
		return vec![bind_host.to_string()];
	}
	// OS依存だが、最もポータブルな手段として hostname と localhost を返す。
	// 詳細な NIC 列挙は Tauri 側の OS API で行う。
	vec!["127.0.0.1".to_string()]
}

#[cfg(test)]
mod tests {
	use super::*;
	use futures_util::SinkExt;
	use tokio_tungstenite::connect_async;

	#[tokio::test]
	async fn server_accepts_connection_and_emits_events() {
		let handle = start(ServerOptions {
			host: "127.0.0.1".into(),
			port: 0,
			sync_interval: None,
		})
		.await
		.unwrap();
		let mut events = handle.state.subscribe();

		// 初期 Timetable を設定
		handle
			.set_initial_timetable(Some(ServerTimetableMessage::new_all(serde_json::json!([]))))
			.await;

		let url = format!("ws://127.0.0.1:{}/ws", handle.bound_port);
		let (mut ws, _resp) = connect_async(&url).await.unwrap();

		// 受信できる ServerEvent::ClientConnected を検出
		let mut got_connected = false;
		for _ in 0..10 {
			if let Ok(ev) = events.recv().await {
				if matches!(ev, ServerEvent::ClientConnected { .. }) {
					got_connected = true;
					break;
				}
			}
		}
		assert!(got_connected);

		// 初期 Timetable を受信
		let msg = ws.next().await.unwrap().unwrap();
		assert!(msg.into_text().unwrap().contains("Timetable"));

		// ID更新を送信
		ws.send(Message::Text(
			r#"{"WorkGroupId":"wg1","WorkId":"w1","TrainId":"t1"}"#.into(),
		))
		.await
		.unwrap();

		// IdUpdate イベントを受信
		let mut got_id_update = false;
		for _ in 0..20 {
			if let Ok(ServerEvent::IdUpdate { message, .. }) = events.recv().await {
				assert_eq!(message.train_id.as_deref(), Some("t1"));
				got_id_update = true;
				break;
			}
		}
		assert!(got_id_update);

		ws.close(None).await.ok();
		handle.shutdown().await;
	}

	#[tokio::test]
	async fn server_routes_request_messages_to_events() {
		let handle = start(ServerOptions {
			host: "127.0.0.1".into(),
			port: 0,
			sync_interval: None,
		})
		.await
		.unwrap();
		let mut events = handle.state.subscribe();

		let url = format!("ws://127.0.0.1:{}/ws", handle.bound_port);
		let (mut ws, _resp) = connect_async(&url).await.unwrap();

		// RequestServerInfo
		ws.send(Message::Text(
			r#"{"MessageType":"RequestServerInfo"}"#.into(),
		))
		.await
		.unwrap();
		// RequestDiagramInfo (DiagramId 指定)
		ws.send(Message::Text(
			r#"{"MessageType":"RequestDiagramInfo","DiagramId":"d-7"}"#.into(),
		))
		.await
		.unwrap();
		// RequestDiagramInfo (DiagramId 省略 = カレント)
		ws.send(Message::Text(
			r#"{"MessageType":"RequestDiagramInfo"}"#.into(),
		))
		.await
		.unwrap();

		let mut got_server_info = false;
		let mut got_diagram_with_id = false;
		let mut got_diagram_current = false;
		for _ in 0..30 {
			match events.recv().await {
				Ok(ServerEvent::RequestServerInfo { .. }) => got_server_info = true,
				Ok(ServerEvent::RequestDiagramInfo { diagram_id, .. }) => {
					if diagram_id.as_deref() == Some("d-7") {
						got_diagram_with_id = true;
					} else if diagram_id.is_none() {
						got_diagram_current = true;
					}
				}
				_ => {}
			}
			if got_server_info && got_diagram_with_id && got_diagram_current {
				break;
			}
		}
		assert!(got_server_info, "RequestServerInfo が来なかった");
		assert!(
			got_diagram_with_id,
			"RequestDiagramInfo (DiagramId付き) が来なかった"
		);
		assert!(
			got_diagram_current,
			"RequestDiagramInfo (DiagramIdなし) が来なかった"
		);

		ws.close(None).await.ok();
		handle.shutdown().await;
	}

	#[tokio::test]
	async fn server_serializes_remote_command_messages() {
		use crate::messages::{
			DiagramInfoMessage, HeaderColorMessage, NotificationMessage, OperationCommandMessage,
			SelectTrainMessage, ServerInfoMessage, TimeFormatMessage,
		};
		// 主要な outbound 型が期待した JSON フィールドを出力することを最小チェック。
		let s = serde_json::to_string(&ServerInfoMessage::new(
			Some("srv".into()),
			None,
			Some("1.0".into()),
			None,
		))
		.unwrap();
		assert!(s.contains(r#""MessageType":"ServerInfo""#));
		assert!(s.contains(r#""Name":"srv""#));
		assert!(s.contains(r#""Version":"1.0""#));

		let s = serde_json::to_string(&DiagramInfoMessage::new(
			Some("d1".into()),
			Some("朝ダイヤ".into()),
			None,
			Some(vec!["wg1".into()]),
		))
		.unwrap();
		assert!(s.contains(r#""MessageType":"DiagramInfo""#));
		assert!(s.contains(r#""DiagramId":"d1""#));
		assert!(
			!s.contains(r#""Id":"d1""#),
			"DiagramInfo の id は DiagramId であるべき"
		);

		let s = serde_json::to_string(&SelectTrainMessage::new(
			Some("wg".into()),
			Some("w".into()),
			Some("t".into()),
		))
		.unwrap();
		assert!(s.contains(r#""MessageType":"SelectTrain""#));

		let s = serde_json::to_string(&OperationCommandMessage::new("StartOperation")).unwrap();
		assert!(s.contains(r#""Action":"StartOperation""#));

		let s = serde_json::to_string(&HeaderColorMessage::with_color(0x336699)).unwrap();
		assert!(s.contains(r#""Color_RGB":3368601"#));
		assert!(s.contains(r#""ResetToDefault":false"#));

		let reset = serde_json::to_string(&HeaderColorMessage::reset()).unwrap();
		assert!(reset.contains(r#""ResetToDefault":true"#));
		assert!(!reset.contains("Color_RGB"));

		let s = serde_json::to_string(&NotificationMessage::new(
			Some("n1".into()),
			Some("お知らせ".into()),
			Some("本文".into()),
			1,
			Some("2026-05-09T01:00:00+09:00".into()),
		))
		.unwrap();
		assert!(s.contains(r#""Priority":1"#));

		let s = serde_json::to_string(&TimeFormatMessage::new(Some("HH:mm".into()))).unwrap();
		assert!(s.contains(r#""Format":"HH:mm""#));
		// Format は null 値も出力する (端末既定リセットを意味する) — skip_serializing_if が無いことを確認
		let s = serde_json::to_string(&TimeFormatMessage::new(None)).unwrap();
		assert!(s.contains(r#""Format":null"#));
	}
}
