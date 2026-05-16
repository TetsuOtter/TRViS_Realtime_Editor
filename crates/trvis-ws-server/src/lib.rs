//! TRViS Realtime Editor の WebSocket サーバ実装。
//!
//! TRViS 本体 (TRViS.NetworkSyncService.WebSocketNetworkSyncService と
//! TRViS.ReferenceServer) の WebSocket プロトコル
//! (`MessageType: "Timetable"` / `MessageType: "SyncedData"` / クライアント→サーバ ID更新)
//! と互換のサーバを提供する。
//!
//! このクレートは Tauri から `start(state)` で起動して使う他、
//! E2E テスト用の standalone バイナリ (`trvis-ws-server-bin`) でも再利用される。

pub mod messages;
pub mod server;
pub mod state;

pub use messages::*;
pub use server::{start, ServerHandle, ServerOptions};
pub use state::{
	MonitorDirection, MonitorFrame, MonitorFrameReceiver, MonitorFrameSender, ServerEvent,
	ServerEventReceiver, ServerEventSender, SharedState,
};
