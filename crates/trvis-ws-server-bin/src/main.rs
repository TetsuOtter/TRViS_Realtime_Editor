//! E2E テスト用の standalone WebSocket サーバ。
//!
//! TauriのデスクトップアプリをDocker内でヘッドレス起動するのは現実的でないため、
//! `trvis-ws-server` クレートを直接ホストする最小バイナリを提供する。
//!
//! - JSON ファイルから WorkGroupData[] を読み、初期 Timetable として配信
//! - HTTP API は持たず、純粋に WebSocket のみ (テストハーネスは別コンテナ)
//! - 標準入力から `{"command":"timetable", ...}` JSON 行を受け取って配信もできる
//!   → e2e テストでエディタ操作をシミュレートするのに使う。
//! - `--cmd-port <port>` を指定すると HTTP `POST /cmd` でも同じコマンドを受け付ける。

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use clap::Parser;
use serde::Deserialize;
use trvis_ws_server::{
	start, OutboundMessage, ServerOptions, ServerSyncedDataMessage, ServerTimetableMessage,
};

#[derive(Parser, Debug)]
#[command(version, about = "TRViS Realtime Editor互換 WebSocketサーバ (E2E用)")]
struct Args {
	#[arg(long, default_value = "0.0.0.0")]
	host: String,
	#[arg(long, default_value_t = 23519)]
	port: u16,
	/// 初期 Timetable の元データ。WorkGroupData[] が入った JSON ファイル。
	#[arg(long)]
	timetable: Option<PathBuf>,
	/// SyncedData の自動送信間隔(ms)。0なら自動送信しない。
	#[arg(long, default_value_t = 250)]
	sync_interval_ms: u64,
	/// HTTP コマンドポート。指定すると `POST /cmd` で JSON コマンドを受け付ける。
	#[arg(long)]
	cmd_port: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
enum StdinCommand {
	Timetable {
		#[serde(default)]
		work_group_id: Option<String>,
		#[serde(default)]
		work_id: Option<String>,
		#[serde(default)]
		train_id: Option<String>,
		data: serde_json::Value,
	},
	Sync {
		location_m: Option<f64>,
		time_ms: i64,
		can_start: bool,
	},
	Shutdown,
}

type SharedHandle = Arc<trvis_ws_server::ServerHandle>;

#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<()> {
	tracing_subscriber::fmt()
		.with_env_filter(
			tracing_subscriber::EnvFilter::try_from_default_env()
				.unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
		)
		.init();

	let args = Args::parse();

	let sync_interval = if args.sync_interval_ms == 0 {
		None
	} else {
		Some(Duration::from_millis(args.sync_interval_ms))
	};

	let handle = start(ServerOptions {
		host: args.host.clone(),
		port: args.port,
		sync_interval,
	})
	.await
	.with_context(|| "WebSocketサーバの起動に失敗")?;

	if let Some(path) = args.timetable.as_ref() {
		let data = std::fs::read_to_string(path)
			.with_context(|| format!("初期Timetable読み込み失敗: {}", path.display()))?;
		let value: serde_json::Value = serde_json::from_str(&data)?;
		handle
			.set_initial_timetable(Some(ServerTimetableMessage::new_all(value)))
			.await;
	}

	println!("ready port={}", handle.bound_port);

	let handle = Arc::new(handle);

	// HTTP コマンドポートが指定されていれば axum サーバを起動
	if let Some(cmd_port) = args.cmd_port {
		let http_handle = handle.clone();
		tokio::spawn(async move {
			let router = Router::new()
				.route("/cmd", post(http_cmd_handler))
				.with_state(http_handle);
			let addr = format!("0.0.0.0:{}", cmd_port);
			let listener = tokio::net::TcpListener::bind(&addr)
				.await
				.expect("cmd-port bind failed");
			tracing::info!("HTTP cmd port listening on {}", addr);
			axum::serve(listener, router)
				.await
				.expect("cmd HTTP server error");
		});
	}

	// 標準入力からのコマンドループ
	let stdin_handle = handle.clone();
	tokio::task::spawn_blocking(move || -> Result<()> {
		let stdin = std::io::stdin();
		for line in BufReader::new(stdin).lines() {
			let line = line?;
			let line = line.trim();
			if line.is_empty() {
				continue;
			}
			let cmd: StdinCommand = match serde_json::from_str(line) {
				Ok(c) => c,
				Err(e) => {
					eprintln!("invalid stdin command: {e}");
					continue;
				}
			};
			let h = stdin_handle.clone();
			tokio::runtime::Handle::current().spawn(dispatch_command(h, cmd));
		}
		Ok(())
	});

	// SIGINT待ち
	tokio::signal::ctrl_c().await?;
	handle.shutdown().await;
	Ok(())
}

async fn http_cmd_handler(
	State(handle): State<SharedHandle>,
	Json(cmd): Json<StdinCommand>,
) -> axum::http::StatusCode {
	dispatch_command(handle, cmd).await;
	axum::http::StatusCode::OK
}

async fn dispatch_command(h: SharedHandle, cmd: StdinCommand) {
	match cmd {
		StdinCommand::Timetable {
			work_group_id,
			work_id,
			train_id,
			data,
		} => {
			let msg = ServerTimetableMessage::new_scoped(work_group_id, work_id, train_id, data);
			h.set_initial_timetable(Some(msg.clone())).await;
			h.state.broadcast(OutboundMessage::Timetable(msg)).await;
		}
		StdinCommand::Sync {
			location_m,
			time_ms,
			can_start,
		} => {
			let msg = ServerSyncedDataMessage::new(location_m, time_ms, can_start);
			h.set_latest_sync(Some(msg.clone())).await;
			h.state.broadcast(OutboundMessage::SyncedData(msg)).await;
		}
		StdinCommand::Shutdown => {
			h.shutdown().await;
		}
	}
}
