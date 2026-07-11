//! Tauri アプリ本体。WebSocket サーバの起動・停止・送信を IPC コマンドで提供する。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
use trvis_ws_server::{
	start, CachedSyncedData, DiagramInfoMessage, HeaderColorMessage, MonitorDirection, MonitorFrame,
	NotificationMessage, NotificationParams, OperationCommandMessage, OutboundMessage,
	SearchTrainResponseMessage, SelectTrainMessage, ServerEvent, ServerHandle, ServerInfoMessage,
	ServerOptions, ServerTimetableMessage, TimeFormatMessage, TrainSearchResultItem,
};

#[derive(Default)]
struct AppState {
	server: Arc<Mutex<Option<ServerHandle>>>,
	/// 通信モニタを有効にしたいかどうかの「意図」。サーバの起動/停止を跨いで保持する。
	/// サーバ起動時にこの値を新しい `SharedState` へ適用することで、
	/// 「モニタを開いてからサーバを起動する」操作順でも確実に有効化される。
	monitor_enabled: Arc<AtomicBool>,
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

	// モニタを先に開いていた場合でも有効化されるよう、保持していた意図を新しい
	// SharedState へ適用する (set_monitor_enabled は起動中サーバにしか効かないため)。
	handle
		.state
		.set_monitor_enabled(state.monitor_enabled.load(Ordering::Relaxed));

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

	// 通信モニタフレームを `ws-monitor` イベントとして UI / モニタウィンドウへ転送する。
	// `lagged` (バッファ溢れ) は debug 用途では致命的でないので件数だけ通知して継続する。
	let mut monitor_rx = handle.state.subscribe_monitor();
	let app_for_monitor = app.clone();
	tokio::spawn(async move {
		loop {
			match monitor_rx.recv().await {
				Ok(frame) => {
					let _ = app_for_monitor.emit("ws-monitor", monitor_frame_to_json(&frame));
				}
				Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
					let _ = app_for_monitor.emit(
						"ws-monitor",
						serde_json::json!({ "type": "lagged", "skipped": skipped }),
					);
				}
				Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
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
	let is_scope_all = work_group_id.is_none() && work_id.is_none() && train_id.is_none();
	let msg = ServerTimetableMessage::new_scoped(work_group_id, work_id, train_id, data);
	// 新規接続クライアントには「全データ」を渡したいので、Scope.All の送信時のみ
	// initial キャッシュを更新する。Scope.WorkGroup などの部分更新で上書きすると、
	// 後から繋いだクライアントが 1 WorkGroup しか受け取れない (#接続時全配信) 不具合になる。
	if is_scope_all {
		handle.set_initial_timetable(Some(msg.clone())).await;
	}
	handle
		.state
		.broadcast(OutboundMessage::Timetable(msg))
		.await;
	Ok(())
}

/// 指定クライアントだけに `Scope.All` の `Timetable` メッセージを送る。
/// 新規接続イベントを受けてエディタが現在の全 WorkGroup を流し直すために使う。
/// 既存クライアントの選択列車・駅 index・位置情報をリセットしたくないので
/// `broadcast_timetable` ではなくこちらを使う。
/// 戻り値は送信に成功したかどうか (false = 送信先クライアントが既に切断されている)。
#[tauri::command]
async fn send_initial_timetable_to(
	state: State<'_, AppState>,
	client_id: String,
	data: Value,
) -> Result<bool, String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = ServerTimetableMessage::new_all(data);
	// 後続クライアントの接続時 initial としても使えるよう、最新の全データキャッシュを更新する。
	handle.set_initial_timetable(Some(msg.clone())).await;
	Ok(
		handle
			.state
			.send_to(&client_id, OutboundMessage::Timetable(msg))
			.await,
	)
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
#[allow(clippy::too_many_arguments)]
async fn broadcast_notification(
	state: State<'_, AppState>,
	id: Option<String>,
	order_number: Option<String>,
	title: Option<String>,
	summary: Option<String>,
	body: Option<String>,
	priority: Option<i32>,
	issued_at: Option<String>,
	receiver: Option<String>,
	sender: Option<String>,
	icon_text: Option<String>,
	icon_color_rgb: Option<i32>,
	icon_image_base64: Option<String>,
	acknowledged: Option<bool>,
	compact_display: Option<bool>,
	section_start_station: Option<String>,
	section_end_station: Option<String>,
	stations_before: Option<i32>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = NotificationMessage::new(NotificationParams {
		id,
		order_number,
		title,
		summary,
		body,
		priority: priority.unwrap_or(0),
		issued_at,
		receiver,
		sender,
		icon_text,
		icon_color_rgb,
		icon_image_base64,
		acknowledged: acknowledged.unwrap_or(false),
		compact_display: compact_display.unwrap_or(false),
		section_start_station,
		section_end_station,
		stations_before: stations_before.unwrap_or(1),
	});
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
	features: Option<Vec<String>>,
) -> Result<(), String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = ServerInfoMessage::new(name, admin, version, protocol_version, features);
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
	features: Option<Vec<String>>,
) -> Result<bool, String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = ServerInfoMessage::new(name, admin, version, protocol_version, features);
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

/// 特定のクライアントだけに `DiagramInfo` を返信する (`RequestDiagramInfo` の応答用)。
/// 戻り値は送信に成功したかどうか (false = 送信先クライアントが既に切断されている)。
#[tauri::command]
async fn respond_diagram_info(
	state: State<'_, AppState>,
	client_id: String,
	diagram_id: Option<String>,
	name: Option<String>,
	description: Option<String>,
	work_group_ids: Option<Vec<String>>,
) -> Result<bool, String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = DiagramInfoMessage::new(diagram_id, name, description, work_group_ids);
	Ok(
		handle
			.state
			.send_to(&client_id, OutboundMessage::DiagramInfo(msg))
			.await,
	)
}

/// 特定のクライアントだけに `SearchTrainResponse` を返信する (`SearchTrain` の応答用)。
/// `results` が空でも必ず送信すること (「該当なし」と「無応答」をクライアントが区別するため)。
/// 戻り値は送信に成功したかどうか (false = 送信先クライアントが既に切断されている)。
#[tauri::command]
async fn respond_search_train(
	state: State<'_, AppState>,
	client_id: String,
	request_id: String,
	results: Vec<TrainSearchResultItem>,
) -> Result<bool, String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg = SearchTrainResponseMessage::new(request_id, results);
	Ok(
		handle
			.state
			.send_to(&client_id, OutboundMessage::SearchTrainResponse(msg))
			.await,
	)
}

/// 特定のクライアントだけに Train スコープの `Timetable` を送る (`RequestTrainTimetable` の応答用)。
/// `broadcast_timetable`/`send_initial_timetable_to` と異なり、他クライアントへは影響させず、
/// 新規接続時の initial キャッシュも更新しない (検索結果はその場限りの表示のため)。
/// 戻り値は送信に成功したかどうか (false = 送信先クライアントが既に切断されている)。
#[tauri::command]
async fn send_train_timetable_to(
	state: State<'_, AppState>,
	client_id: String,
	work_group_id: String,
	work_id: String,
	train_id: String,
	data: Value,
) -> Result<bool, String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	let msg =
		ServerTimetableMessage::new_scoped(Some(work_group_id), Some(work_id), Some(train_id), data);
	Ok(
		handle
			.state
			.send_to(&client_id, OutboundMessage::Timetable(msg))
			.await,
	)
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

/// 通信モニタの有効/無効を切り替える。
/// 無効時はワイヤを流れる JSON の観測フレームを一切発火しない。
/// サーバ未起動時は no-op (起動後にモニタを開いても再設定されるため問題ない)。
#[tauri::command]
async fn set_monitor_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
	// 意図を保持しておき、サーバ起動時にも適用できるようにする。
	state.monitor_enabled.store(enabled, Ordering::Relaxed);
	let guard = state.server.lock().await;
	if let Some(handle) = guard.as_ref() {
		handle.state.set_monitor_enabled(enabled);
	}
	Ok(())
}

/// デバッグ用: 任意のテキストを一切加工せずクライアントへ送る。
/// `client_id` が `None` の場合は全クライアントへブロードキャスト、
/// 指定された場合はそのクライアントだけに送る (戻り値 false = 送信先が既に切断)。
/// JSON 妥当性検証はしない (「任意の内容を送信」要件のため)。
#[tauri::command]
async fn send_raw_message(
	state: State<'_, AppState>,
	client_id: Option<String>,
	text: String,
) -> Result<bool, String> {
	let guard = state.server.lock().await;
	let handle = guard.as_ref().ok_or("サーバが未起動です")?;
	match client_id {
		Some(id) => Ok(handle.state.send_to(&id, OutboundMessage::Raw(text)).await),
		None => {
			handle.state.broadcast(OutboundMessage::Raw(text)).await;
			Ok(true)
		}
	}
}

/// 通信モニタを別ウィンドウで開く。既に開いていればフォーカスする。
/// 同一フロントエンドを `#monitor` ハッシュ付きで読み込み、JS 側でモニタ単独表示に分岐する。
#[tauri::command]
async fn open_monitor_window(app: tauri::AppHandle) -> Result<(), String> {
	if let Some(w) = app.get_webview_window("monitor") {
		let _ = w.set_focus();
		return Ok(());
	}
	tauri::WebviewWindowBuilder::new(
		&app,
		"monitor",
		tauri::WebviewUrl::App("index.html#monitor".into()),
	)
	.title("通信モニタ - TRViS Realtime Editor")
	.inner_size(900.0, 700.0)
	.min_inner_size(480.0, 360.0)
	.build()
	.map_err(|e| e.to_string())?;
	Ok(())
}

/// 別ウィンドウのモニタをアプリ内ドックへ戻す。
/// メインウィンドウへ `monitor-redock` を通知してから、モニタウィンドウを閉じる。
/// (ウィンドウ間でストアは共有されないため、イベント経由で位置を伝える。)
#[tauri::command]
async fn redock_monitor(app: tauri::AppHandle, position: String) -> Result<(), String> {
	app
		.emit("monitor-redock", position)
		.map_err(|e| e.to_string())?;
	if let Some(w) = app.get_webview_window("monitor") {
		let _ = w.close();
	}
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
		ServerEvent::SearchTrain {
			client_id,
			request_id,
			train_number,
			match_mode,
		} => serde_json::json!({
				"type": "search-train",
				"clientId": client_id,
				"requestId": request_id,
				"trainNumber": train_number,
				"matchMode": match_mode,
		}),
		ServerEvent::RequestTrainTimetable {
			client_id,
			request_id,
			work_group_id,
			work_id,
			train_id,
		} => serde_json::json!({
				"type": "request-train-timetable",
				"clientId": client_id,
				"requestId": request_id,
				"workGroupId": work_group_id,
				"workId": work_id,
				"trainId": train_id,
		}),
		ServerEvent::Error { message } => serde_json::json!({
				"type": "error", "message": message
		}),
	}
}

fn monitor_frame_to_json(frame: &MonitorFrame) -> Value {
	let direction = match frame.direction {
		MonitorDirection::In => "in",
		MonitorDirection::Out => "out",
	};
	serde_json::json!({
		"type": "frame",
		"direction": direction,
		"clientId": frame.client_id,
		"json": frame.json,
		"ts": frame.ts_ms,
	})
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
			send_initial_timetable_to,
			broadcast_select_train,
			broadcast_operation_command,
			broadcast_header_color,
			broadcast_notification,
			broadcast_time_format,
			broadcast_server_info,
			respond_server_info,
			broadcast_diagram_info,
			respond_diagram_info,
			respond_search_train,
			send_train_timetable_to,
			set_synced_data,
			set_monitor_enabled,
			send_raw_message,
			open_monitor_window,
			redock_monitor,
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
