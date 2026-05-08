//! TRViS WebSocket プロトコルのメッセージ型。
//! TRViS 本体の TRViS.JsonModels および
//! TRViS.NetworkSyncService.WebSocketNetworkSyncService が解釈するJSON形式に準拠。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// クライアント(=TRViS本体) → サーバ の選択ID更新メッセージ。
/// `MessageType` フィールドは持たず、`WorkGroupId/WorkId/TrainId` のいずれか1つ以上を含む。
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ClientIdUpdateMessage {
	#[serde(rename = "WorkGroupId", skip_serializing_if = "Option::is_none")]
	pub work_group_id: Option<String>,
	#[serde(rename = "WorkId", skip_serializing_if = "Option::is_none")]
	pub work_id: Option<String>,
	#[serde(rename = "TrainId", skip_serializing_if = "Option::is_none")]
	pub train_id: Option<String>,
}

/// サーバ → クライアント の SyncedData メッセージ。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSyncedDataMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "Location_m", skip_serializing_if = "Option::is_none")]
	pub location_m: Option<f64>,
	#[serde(rename = "Time_ms")]
	pub time_ms: i64,
	#[serde(rename = "CanStart")]
	pub can_start: bool,
}

impl ServerSyncedDataMessage {
	pub fn new(location_m: Option<f64>, time_ms: i64, can_start: bool) -> Self {
		Self {
			message_type: "SyncedData".into(),
			location_m,
			time_ms,
			can_start,
		}
	}
}

/// サーバ → クライアント の Timetable メッセージ。
/// `Data` には Scope に応じて `WorkGroupData[]` / `WorkGroupData` / `WorkData` / `TrainData` のいずれかが入る。
/// 本サーバは UI から渡される値を素通しするため、`Value` で持つ。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerTimetableMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "WorkGroupId", skip_serializing_if = "Option::is_none")]
	pub work_group_id: Option<String>,
	#[serde(rename = "WorkId", skip_serializing_if = "Option::is_none")]
	pub work_id: Option<String>,
	#[serde(rename = "TrainId", skip_serializing_if = "Option::is_none")]
	pub train_id: Option<String>,
	#[serde(rename = "Data")]
	pub data: Value,
}

impl ServerTimetableMessage {
	pub fn new_all(data: Value) -> Self {
		Self {
			message_type: "Timetable".into(),
			work_group_id: None,
			work_id: None,
			train_id: None,
			data,
		}
	}

	pub fn new_scoped(
		work_group_id: Option<String>,
		work_id: Option<String>,
		train_id: Option<String>,
		data: Value,
	) -> Self {
		Self {
			message_type: "Timetable".into(),
			work_group_id,
			work_id,
			train_id,
			data,
		}
	}
}

/// 上位(UI/Tauri) からサーバに送信を依頼するメッセージ。
#[derive(Debug, Clone)]
pub enum OutboundMessage {
	Timetable(ServerTimetableMessage),
	SyncedData(ServerSyncedDataMessage),
}

impl OutboundMessage {
	pub fn to_json_string(&self) -> serde_json::Result<String> {
		match self {
			OutboundMessage::Timetable(m) => serde_json::to_string(m),
			OutboundMessage::SyncedData(m) => serde_json::to_string(m),
		}
	}
}
