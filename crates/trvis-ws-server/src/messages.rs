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

/// サーバ内に保持する SyncedData の最新スナップショット。
///
/// `auto_time_ms = true` のとき、`time_ms` フィールドは無視され、
/// `materialize()` 呼び出し時のローカル時刻 (現地の 0時からの経過 ms) で
/// 都度上書きされる。これにより、UI 側が一定間隔で更新を打たなくても、
/// 各クライアントの再送タイマが常に新しい時刻を載せて再ブロードキャストできる
/// (= 受信側で同じ秒数が止まって突然ジャンプする現象を抑止する)。
#[derive(Debug, Clone)]
pub struct CachedSyncedData {
	pub location_m: Option<f64>,
	pub time_ms: i64,
	pub can_start: bool,
	pub auto_time_ms: bool,
}

impl CachedSyncedData {
	pub fn materialize(&self) -> ServerSyncedDataMessage {
		let time_ms = if self.auto_time_ms {
			current_local_millis_of_day()
		} else {
			self.time_ms
		};
		ServerSyncedDataMessage::new(self.location_m, time_ms, self.can_start)
	}
}

/// ローカル時刻の 0時からの経過 ms を返す。
/// TRViS 側 (`SyncedData.Time_ms`) はローカル時刻ベースなので、ここでも UTC では
/// なくサーバホストのローカルタイムゾーンに合わせる。
fn current_local_millis_of_day() -> i64 {
	use chrono::{Local, Timelike};
	let now = Local::now();
	let secs = i64::from(now.num_seconds_from_midnight());
	let ms = i64::from(now.nanosecond() / 1_000_000);
	secs * 1000 + ms
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

/// サーバ → クライアント の ServerInfo メッセージ。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerInfoMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "Name", skip_serializing_if = "Option::is_none")]
	pub name: Option<String>,
	#[serde(rename = "Admin", skip_serializing_if = "Option::is_none")]
	pub admin: Option<String>,
	#[serde(rename = "Version", skip_serializing_if = "Option::is_none")]
	pub version: Option<String>,
	#[serde(rename = "ProtocolVersion", skip_serializing_if = "Option::is_none")]
	pub protocol_version: Option<String>,
	/// 拡張機能ネゴシエーション (v1.1)。既知の機能 ID は `"TrainSearch"`。
	/// 省略/null は「拡張機能なし」を意味する。
	#[serde(rename = "Features", skip_serializing_if = "Option::is_none")]
	pub features: Option<Vec<String>>,
}

impl ServerInfoMessage {
	pub fn new(
		name: Option<String>,
		admin: Option<String>,
		version: Option<String>,
		protocol_version: Option<String>,
		features: Option<Vec<String>>,
	) -> Self {
		Self {
			message_type: "ServerInfo".into(),
			name,
			admin,
			version,
			protocol_version,
			features,
		}
	}
}

/// サーバ → クライアント の DiagramInfo メッセージ。
/// ID のフィールド名は **`DiagramId`** であり、`Id` ではない (TRViS 本体の WebSocketNetworkSyncService 仕様)。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiagramInfoMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "DiagramId", skip_serializing_if = "Option::is_none")]
	pub diagram_id: Option<String>,
	#[serde(rename = "Name", skip_serializing_if = "Option::is_none")]
	pub name: Option<String>,
	#[serde(rename = "Description", skip_serializing_if = "Option::is_none")]
	pub description: Option<String>,
	#[serde(rename = "WorkGroupIds", skip_serializing_if = "Option::is_none")]
	pub work_group_ids: Option<Vec<String>>,
}

impl DiagramInfoMessage {
	pub fn new(
		diagram_id: Option<String>,
		name: Option<String>,
		description: Option<String>,
		work_group_ids: Option<Vec<String>>,
	) -> Self {
		Self {
			message_type: "DiagramInfo".into(),
			diagram_id,
			name,
			description,
			work_group_ids,
		}
	}
}

/// サーバ → クライアント: 列車選択指示。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SelectTrainMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "WorkGroupId", skip_serializing_if = "Option::is_none")]
	pub work_group_id: Option<String>,
	#[serde(rename = "WorkId", skip_serializing_if = "Option::is_none")]
	pub work_id: Option<String>,
	#[serde(rename = "TrainId", skip_serializing_if = "Option::is_none")]
	pub train_id: Option<String>,
}

impl SelectTrainMessage {
	pub fn new(
		work_group_id: Option<String>,
		work_id: Option<String>,
		train_id: Option<String>,
	) -> Self {
		Self {
			message_type: "SelectTrain".into(),
			work_group_id,
			work_id,
			train_id,
		}
	}
}

/// サーバ → クライアント: 運行操作コマンド。
/// `Action` は文字列で、TRViS 側の `OperationCommandType` enum 名と一致させる必要がある。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationCommandMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "Action")]
	pub action: String,
}

impl OperationCommandMessage {
	pub fn new(action: impl Into<String>) -> Self {
		Self {
			message_type: "OperationCommand".into(),
			action: action.into(),
		}
	}
}

/// サーバ → クライアント: タイトルバー色変更要求。
/// `color_rgb` は 0xRRGGBB の整数。`reset_to_default` が true の場合は端末既定に戻す。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderColorMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "ResetToDefault")]
	pub reset_to_default: bool,
	#[serde(rename = "Color_RGB", skip_serializing_if = "Option::is_none")]
	pub color_rgb: Option<i32>,
}

impl HeaderColorMessage {
	pub fn reset() -> Self {
		Self {
			message_type: "HeaderColor".into(),
			reset_to_default: true,
			color_rgb: None,
		}
	}

	pub fn with_color(color_rgb: i32) -> Self {
		Self {
			message_type: "HeaderColor".into(),
			reset_to_default: false,
			color_rgb: Some(color_rgb),
		}
	}
}

/// サーバ → クライアント: 通告 (任意のお知らせ) 配信。
/// `issued_at` は RFC3339 (ISO8601) 文字列。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NotificationMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "Id", skip_serializing_if = "Option::is_none")]
	pub id: Option<String>,
	#[serde(rename = "Title", skip_serializing_if = "Option::is_none")]
	pub title: Option<String>,
	#[serde(rename = "Body", skip_serializing_if = "Option::is_none")]
	pub body: Option<String>,
	#[serde(rename = "Priority")]
	pub priority: i32,
	#[serde(rename = "IssuedAt", skip_serializing_if = "Option::is_none")]
	pub issued_at: Option<String>,
}

impl NotificationMessage {
	pub fn new(
		id: Option<String>,
		title: Option<String>,
		body: Option<String>,
		priority: i32,
		issued_at: Option<String>,
	) -> Self {
		Self {
			message_type: "Notification".into(),
			id,
			title,
			body,
			priority,
			issued_at,
		}
	}
}

/// サーバ → クライアント: タイトルバー時刻表示フォーマット指定。
/// `format` が `None` (JSON 上 `null` / 省略) の場合は端末既定にリセットを意味する。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TimeFormatMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "Format")]
	pub format: Option<String>,
}

impl TimeFormatMessage {
	pub fn new(format: Option<String>) -> Self {
		Self {
			message_type: "TimeFormat".into(),
			format,
		}
	}
}

/// `SearchTrainResponse` の候補 1 件。
/// 完全な時刻表 (`TrainData`) は含まず、確定時に `RequestTrainTimetable` で別途取得する
/// (TRViS 本体 v1.1 の 2 段階フローに準拠)。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainSearchResultItem {
	#[serde(rename = "WorkGroupId")]
	pub work_group_id: Option<String>,
	#[serde(rename = "WorkId")]
	pub work_id: Option<String>,
	#[serde(rename = "TrainId")]
	pub train_id: Option<String>,
	#[serde(rename = "TrainNumber")]
	pub train_number: Option<String>,
	#[serde(rename = "WorkName")]
	pub work_name: Option<String>,
	/// -1 = Inbound / 1 = Outbound。
	#[serde(rename = "Direction")]
	pub direction: Option<i32>,
	#[serde(rename = "StartStationName")]
	pub start_station_name: Option<String>,
	#[serde(rename = "StartTime")]
	pub start_time: Option<String>,
	#[serde(rename = "EndStationName")]
	pub end_station_name: Option<String>,
	#[serde(rename = "EndTime")]
	pub end_time: Option<String>,
}

/// サーバ → クライアント の SearchTrainResponse メッセージ (v1.1)。
/// `RequestId` はクライアントが送ってきた `SearchTrain.RequestId` をそのまま echo する。
/// `Results` は該当0件でも必ず送る (空配列 = 「該当なし」、無応答 = タイムアウトと区別するため)。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchTrainResponseMessage {
	#[serde(rename = "MessageType")]
	pub message_type: String,
	#[serde(rename = "RequestId")]
	pub request_id: String,
	#[serde(rename = "Results")]
	pub results: Vec<TrainSearchResultItem>,
}

impl SearchTrainResponseMessage {
	pub fn new(request_id: String, results: Vec<TrainSearchResultItem>) -> Self {
		Self {
			message_type: "SearchTrainResponse".into(),
			request_id,
			results,
		}
	}
}

/// 上位(UI/Tauri) からサーバに送信を依頼するメッセージ。
#[derive(Debug, Clone)]
pub enum OutboundMessage {
	Timetable(ServerTimetableMessage),
	SyncedData(ServerSyncedDataMessage),
	ServerInfo(ServerInfoMessage),
	DiagramInfo(DiagramInfoMessage),
	SelectTrain(SelectTrainMessage),
	OperationCommand(OperationCommandMessage),
	HeaderColor(HeaderColorMessage),
	Notification(NotificationMessage),
	TimeFormat(TimeFormatMessage),
	SearchTrainResponse(SearchTrainResponseMessage),
	/// デバッグ用: 任意のテキストを一切加工せずそのまま送る。
	/// 通信モニタの手動送信機能で使用する。JSON 妥当性検証はしない。
	Raw(String),
}

impl OutboundMessage {
	pub fn to_json_string(&self) -> serde_json::Result<String> {
		match self {
			OutboundMessage::Timetable(m) => serde_json::to_string(m),
			OutboundMessage::SyncedData(m) => serde_json::to_string(m),
			OutboundMessage::ServerInfo(m) => serde_json::to_string(m),
			OutboundMessage::DiagramInfo(m) => serde_json::to_string(m),
			OutboundMessage::SelectTrain(m) => serde_json::to_string(m),
			OutboundMessage::OperationCommand(m) => serde_json::to_string(m),
			OutboundMessage::HeaderColor(m) => serde_json::to_string(m),
			OutboundMessage::Notification(m) => serde_json::to_string(m),
			OutboundMessage::TimeFormat(m) => serde_json::to_string(m),
			OutboundMessage::SearchTrainResponse(m) => serde_json::to_string(m),
			OutboundMessage::Raw(s) => Ok(s.clone()),
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn raw_message_is_passed_through_verbatim() {
		// 手動送信は一切加工せず素通しすること (整形・再シリアライズしない)。
		let payload = r#"{"MessageType":"Custom","x":[1,2,3],"nested":{"a":"b"}}"#;
		let out = OutboundMessage::Raw(payload.to_string())
			.to_json_string()
			.unwrap();
		assert_eq!(out, payload);
	}

	#[test]
	fn raw_message_does_not_require_valid_json() {
		// 「任意の内容を送信」要件: JSON でなくてもそのまま通す。
		let out = OutboundMessage::Raw("not json".to_string())
			.to_json_string()
			.unwrap();
		assert_eq!(out, "not json");
	}
}
