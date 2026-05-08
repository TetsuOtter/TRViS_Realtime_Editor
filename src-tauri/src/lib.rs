//! Tauri アプリ本体。WebSocket サーバの起動・停止・送信を IPC コマンドで提供する。

use std::sync::Arc;

use serde_json::Value;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
use trvis_ws_server::{
	start, OutboundMessage, ServerEvent, ServerHandle, ServerOptions, ServerSyncedDataMessage,
	ServerTimetableMessage,
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

/// SyncedData の最新値を更新し、即時送信する。
#[tauri::command]
async fn set_synced_data(
	state: State<'_, AppState>,
	location_m: Option<f64>,
	time_ms: i64,
	can_start: bool,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = ServerSyncedDataMessage::new(location_m, time_ms, can_start);
	handle.set_latest_sync(Some(msg.clone())).await;
	handle
		.state
		.broadcast(OutboundMessage::SyncedData(msg))
		.await;
	Ok(())
}

#[tauri::command]
fn list_local_hosts() -> Vec<String> {
	list_local_ipv4()
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
		ServerEvent::Error { message } => serde_json::json!({
				"type": "error", "message": message
		}),
	}
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_shell::init())
		.manage(AppState::default())
		.invoke_handler(tauri::generate_handler![
			start_server,
			stop_server,
			broadcast_timetable,
			set_synced_data,
			list_local_hosts
		])
		.setup(|app| {
			let _ = app.get_webview_window("main");
			Ok(())
		})
		.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
