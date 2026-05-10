//! Tauri アプリ本体。WebSocket サーバの起動・停止・送信を IPC コマンドで提供する。

use std::sync::Arc;

use serde_json::Value;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
use trvis_ws_server::{
	start, CachedSyncedData, DiagramInfoMessage, HeaderColorMessage, NotificationMessage,
	OperationCommandMessage, OutboundMessage, SelectTrainMessage, ServerEvent, ServerHandle,
	ServerInfoMessage, ServerOptions, ServerTimetableMessage, TimeFormatMessage,
};

#[derive(Default)]
struct AppState {
	server: Arc<Mutex<Option<ServerHandle>>>,
}

#[tauri::command]
async fn start_server(
	app: tauri::AppHandle,
	state: State<'_, AppState>,
	host: Option<String>,
	port: Option<u16>,
) -> Result<StartResult, String> {
	let mut guard = state.server.lock().await;
	if guard.is_some() {
		return Err("既にサーバが起動しています".into());
	}
	let host = host.unwrap_or_else(|| "0.0.0.0".to_string());
	let port = port.unwrap_or(23519);
	let handle = start(ServerOptions {
		host,
		port,
		sync_interval: Some(std::time::Duration::from_millis(250)),
	})
	.await
	.map_err(|e| e.to_string())?;

	let mut events = handle.state.subscribe();
	let app_for_events = app.clone();
	tokio::spawn(async move {
		while let Ok(ev) = events.recv().await {
			let _ = app_for_events.emit("ws-event", server_event_to_json(&ev));
			if matches!(ev, ServerEvent::Stopped) {
				break;
			}
		}
	});

	let bound_port = handle.bound_port;
	let hosts = list_local_ipv4();
	*guard = Some(handle);

	Ok(StartResult {
		port: bound_port,
		hosts,
	})
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
	let mut guard = state.server.lock().await;
	if let Some(handle) = guard.take() {
		handle.shutdown().await;
	}
	Ok(())
}

/// 全クライアントに `Timetable` メッセージを送る。
/// `data` には Scope に応じた JSON 値 (`WorkGroupData[]` / `WorkGroupData` / `WorkData` / `TrainData`) を渡す。
#[tauri::command]
async fn broadcast_timetable(
	state: State<'_, AppState>,
	work_group_id: Option<String>,
	work_id: Option<String>,
	train_id: Option<String>,
	data: Value,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = ServerTimetableMessage::new_scoped(work_group_id, work_id, train_id, data);
	// 接続後に来た新規クライアントにも届くように initial を更新
	handle.set_initial_timetable(Some(msg.clone())).await;
	handle
		.state
		.broadcast(OutboundMessage::Timetable(msg))
		.await;
	Ok(())
}

/// 全クライアントへ `SelectTrain` メッセージを送る (TRViS で表示中の列車を切り替える指示)。
#[tauri::command]
async fn broadcast_select_train(
	state: State<'_, AppState>,
	work_group_id: Option<String>,
	work_id: Option<String>,
	train_id: Option<String>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = SelectTrainMessage::new(work_group_id, work_id, train_id);
	handle
		.state
		.broadcast(OutboundMessage::SelectTrain(msg))
		.await;
	Ok(())
}

/// 全クライアントへ `OperationCommand` を送る。
/// `action` は TRViS 側 enum 名 ("StartOperation" / "EndOperation" /
/// "EnableLocationService" / "DisableLocationService") のいずれか。
#[tauri::command]
async fn broadcast_operation_command(
	state: State<'_, AppState>,
	action: String,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	handle
		.state
		.broadcast(OutboundMessage::OperationCommand(
			OperationCommandMessage::new(action),
		))
		.await;
	Ok(())
}

/// 全クライアントへ `HeaderColor` を送る。
/// `reset_to_default` が true の場合は端末既定にリセット (color_rgb は無視)。
/// false の場合は `color_rgb` (0xRRGGBB の整数) を適用する。
#[tauri::command]
async fn broadcast_header_color(
	state: State<'_, AppState>,
	reset_to_default: bool,
	color_rgb: Option<i32>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = if reset_to_default {
		HeaderColorMessage::reset()
	} else {
		HeaderColorMessage::with_color(color_rgb.unwrap_or(0))
	};
	handle
		.state
		.broadcast(OutboundMessage::HeaderColor(msg))
		.await;
	Ok(())
}

/// 全クライアントへ `Notification` を送る。
#[tauri::command]
async fn broadcast_notification(
	state: State<'_, AppState>,
	id: Option<String>,
	title: Option<String>,
	body: Option<String>,
	priority: Option<i32>,
	issued_at: Option<String>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = NotificationMessage::new(id, title, body, priority.unwrap_or(0), issued_at);
	handle
		.state
		.broadcast(OutboundMessage::Notification(msg))
		.await;
	Ok(())
}

/// 全クライアントへ `TimeFormat` を送る (例: `"HH:mm"` / `"HH:mm:ss"`)。
/// `format` を省略 / null にした場合は端末既定にリセット。
#[tauri::command]
async fn broadcast_time_format(
	state: State<'_, AppState>,
	format: Option<String>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	handle
		.state
		.broadcast(OutboundMessage::TimeFormat(TimeFormatMessage::new(format)))
		.await;
	Ok(())
}

/// 全クライアントへ `ServerInfo` を送る (proactive broadcast)。
/// `RequestServerInfo` への応答は `respond_server_info` を使うこと。
#[tauri::command]
async fn broadcast_server_info(
	state: State<'_, AppState>,
	name: Option<String>,
	admin: Option<String>,
	version: Option<String>,
	protocol_version: Option<String>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = ServerInfoMessage::new(name, admin, version, protocol_version);
	handle
		.state
		.broadcast(OutboundMessage::ServerInfo(msg))
		.await;
	Ok(())
}

/// 特定のクライアントだけに `ServerInfo` を返信する (`RequestServerInfo` の応答用)。
/// 戻り値は送信に成功したかどうか (false = 送信先クライアントが既に切断されている)。
#[tauri::command]
async fn respond_server_info(
	state: State<'_, AppState>,
	client_id: String,
	name: Option<String>,
	admin: Option<String>,
	version: Option<String>,
	protocol_version: Option<String>,
) -> Result<bool, String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = ServerInfoMessage::new(name, admin, version, protocol_version);
	Ok(
		handle
			.state
			.send_to(&client_id, OutboundMessage::ServerInfo(msg))
			.await,
	)
}

/// 全クライアントへ `DiagramInfo` を送る。
#[tauri::command]
async fn broadcast_diagram_info(
	state: State<'_, AppState>,
	diagram_id: Option<String>,
	name: Option<String>,
	description: Option<String>,
	work_group_ids: Option<Vec<String>>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = DiagramInfoMessage::new(diagram_id, name, description, work_group_ids);
	handle
		.state
		.broadcast(OutboundMessage::DiagramInfo(msg))
		.await;
	Ok(())
}

/// SyncedData の最新値を更新し、即時送信する。
///
/// `auto_time_ms = true` のときはサーバ側で再送毎に wall-clock 由来の `Time_ms` を
/// 計算するため、UI から渡された `time_ms` は無視され、`location_m` / `can_start` の
/// 更新と「自動時刻モードを有効にする」というシグナルだけが効く。これにより、
/// UI 側の broadcast 周期 (1s) とサーバの再送タイマ (250ms) のズレで同じ秒が
/// 重複送信される問題を防ぐ。
#[tauri::command]
async fn set_synced_data(
	state: State<'_, AppState>,
	location_m: Option<f64>,
	time_ms: i64,
	can_start: bool,
	auto_time_ms: bool,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let cached = CachedSyncedData {
		location_m,
		time_ms,
		can_start,
		auto_time_ms,
	};
	handle.set_latest_sync(Some(cached.clone())).await;
	handle
		.state
		.broadcast(OutboundMessage::SyncedData(cached.materialize()))
		.await;
	Ok(())
}

#[tauri::command]
fn list_local_hosts() -> Vec<String> {
	list_local_ipv4()
}

#[derive(serde::Serialize, Clone)]
struct AppInfo {
	version: String,
	commit: String,
}

/// アプリのバージョン (tauri.conf.json 由来) と
/// ビルド時に埋め込んだ git コミットハッシュを返す。
#[tauri::command]
fn get_app_info(app: tauri::AppHandle) -> AppInfo {
	AppInfo {
		version: app.package_info().version.to_string(),
		commit: env!("GIT_COMMIT").to_string(),
	}
}

/// 任意のパスへ UTF-8 テキストを書き出す。
/// JSON エクスポートで `dialog.save()` が返したパスをそのまま渡して使う想定。
/// fs プラグイン全体を有効化せずに「ユーザがダイアログで選んだ 1 ファイル」だけを
/// 書き換えられるようにするための薄いラッパ。
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
	std::fs::write(&path, contents).map_err(|e| format!("ファイル書き込みに失敗しました: {e}"))
}

fn list_local_ipv4() -> Vec<String> {
	use local_ip_address::list_afinet_netifas;
	let mut hosts = vec![];
	if let Ok(network_interfaces) = list_afinet_netifas() {
		for (_name, ip) in network_interfaces {
			if let std::net::IpAddr::V4(v4) = ip {
				if !v4.is_loopback() && !v4.is_link_local() && !v4.is_unspecified() {
					hosts.push(v4.to_string());
				}
			}
		}
	}
	if hosts.is_empty() {
		hosts.push("127.0.0.1".to_string());
	}
	hosts
}

#[derive(serde::Serialize, Clone)]
struct StartResult {
	port: u16,
	hosts: Vec<String>,
}

fn server_event_to_json(ev: &ServerEvent) -> Value {
	match ev {
		ServerEvent::Started { port, hosts } => serde_json::json!({
				"type": "started", "port": port, "hosts": hosts
		}),
		ServerEvent::Stopped => serde_json::json!({ "type": "stopped" }),
		ServerEvent::ClientConnected { client_id } => serde_json::json!({
				"type": "client-connected", "clientId": client_id
		}),
		ServerEvent::ClientDisconnected { client_id } => serde_json::json!({
				"type": "client-disconnected", "clientId": client_id
		}),
		ServerEvent::IdUpdate { client_id, message } => serde_json::json!({
				"type": "id-update",
				"clientId": client_id,
				"message": message
		}),
		ServerEvent::RequestServerInfo { client_id } => serde_json::json!({
				"type": "request-server-info",
				"clientId": client_id,
		}),
		ServerEvent::RequestDiagramInfo {
			client_id,
			diagram_id,
		} => serde_json::json!({
				"type": "request-diagram-info",
				"clientId": client_id,
				"diagramId": diagram_id,
		}),
		ServerEvent::Error { message } => serde_json::json!({
				"type": "error", "message": message
		}),
	}
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_shell::init())
		.plugin(tauri_plugin_dialog::init())
		.manage(AppState::default())
		.invoke_handler(tauri::generate_handler![
			start_server,
			stop_server,
			broadcast_timetable,
			broadcast_select_train,
			broadcast_operation_command,
			broadcast_header_color,
			broadcast_notification,
			broadcast_time_format,
			broadcast_server_info,
			respond_server_info,
			broadcast_diagram_info,
			set_synced_data,
			list_local_hosts,
			write_text_file,
			get_app_info
		])
		.setup(|app| {
			let _ = app.get_webview_window("main");
			Ok(())
		})
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
