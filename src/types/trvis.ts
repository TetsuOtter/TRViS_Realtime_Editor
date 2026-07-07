/**
 * TRViS.JsonModels に準拠したデータ型。
 *
 * 元定義:
 *   - https://github.com/TetsuOtter/TRViS.JsonModels/blob/main/TRViS.JsonModels/WorkGroupData.cs
 *   - WorkData.cs / TrainData.cs / TimetableRowData.cs / SyncedData.cs
 *
 * 命名・nullability・JSONキーは C# 側と完全一致させる。
 * (TRViS本体の `JsonSerializerOptions { PropertyNameCaseInsensitive = true }` で受信されるが、
 *  我々は CamelCase の C# プロパティ名を JSON 上でもそのまま使用する。)
 */

export interface TimetableRowData {
	Id?: string | null;
	StationName: string;
	Location_m: number;
	Longitude_deg?: number | null;
	Latitude_deg?: number | null;
	OnStationDetectRadius_m?: number | null;
	FullName?: string | null;
	RecordType?: number | null;
	TrackName?: string | null;
	DriveTime_MM?: number | null;
	DriveTime_SS?: number | null;
	IsOperationOnlyStop?: boolean | null;
	IsPass?: boolean | null;
	HasBracket?: boolean | null;
	IsLastStop?: boolean | null;
	Arrive?: string | null;
	Departure?: string | null;
	RunInLimit?: number | null;
	RunOutLimit?: number | null;
	Remarks?: string | null;
	MarkerColor?: string | null;
	MarkerText?: string | null;
	WorkType?: number | null;
}

export interface TrainData {
	Id?: string | null;
	TrainNumber: string;
	MaxSpeed?: string | null;
	SpeedType?: string | null;
	NominalTractiveCapacity?: string | null;
	CarCount?: number | null;
	Destination?: string | null;
	BeginRemarks?: string | null;
	AfterRemarks?: string | null;
	Remarks?: string | null;
	BeforeDeparture?: string | null;
	TrainInfo?: string | null;
	Direction: number;
	WorkType?: number | null;
	AfterArrive?: string | null;
	BeforeDeparture_OnStationTrackCol?: string | null;
	AfterArrive_OnStationTrackCol?: string | null;
	DayCount?: number | null;
	IsRideOnMoving?: boolean | null;
	Color?: string | null;
	TimetableRows: TimetableRowData[];
	NextTrainId?: string | null;
}

export interface WorkData {
	Id?: string | null;
	Name: string;
	AffectDate?: string | null;
	AffixContentType?: number | null;
	AffixContent?: string | null;
	Remarks?: string | null;
	HasETrainTimetable?: boolean | null;
	ETrainTimetableContentType?: number | null;
	ETrainTimetableContent?: string | null;
	Trains: TrainData[];
}

export interface WorkGroupData {
	Id?: string | null;
	Name: string;
	DBVersion?: number | null;
	Works: WorkData[];
}

export interface SyncedData {
	Location_m?: number | null;
	Time_ms?: number | null;
	CanStart?: boolean | null;
}

/* -------------------------------------------------------------------------- */
/*  WebSocket message types (TRViS.LocalServers.Core.WebSocket.* に準拠)       */
/* -------------------------------------------------------------------------- */

/** クライアント(=TRViS本体) → サーバ(=本エディタ) の選択ID更新メッセージ */
export interface ClientIdUpdateMessage {
	WorkGroupId?: string;
	WorkId?: string;
	TrainId?: string;
}

/** サーバ → クライアント の SyncedData メッセージ */
export interface ServerSyncedDataMessage {
	MessageType: "SyncedData";
	Location_m?: number | null;
	Time_ms: number;
	CanStart: boolean;
}

/** サーバ → クライアント の Timetable メッセージ */
export interface ServerTimetableMessage {
	MessageType: "Timetable";
	WorkGroupId?: string;
	WorkId?: string;
	TrainId?: string;
	/**
	 * Scope に応じて型が変わる:
	 *   - All        : WorkGroupData[]
	 *   - WorkGroup  : WorkGroupData
	 *   - Work       : WorkData
	 *   - Train      : TrainData
	 */
	Data: WorkGroupData[] | WorkGroupData | WorkData | TrainData | null;
}

/** サーバ → クライアント の ServerInfo (RequestServerInfo への応答 もしくは proactive broadcast) */
export interface ServerInfoMessage {
	MessageType: "ServerInfo";
	Name?: string | null;
	Admin?: string | null;
	Version?: string | null;
	ProtocolVersion?: string | null;
	/**
	 * 拡張機能ネゴシエーション (v1.1)。既知の機能 ID は `"TrainSearch"`。
	 * 省略/null は「拡張機能なし」を意味する。
	 */
	Features?: string[] | null;
}

/**
 * サーバ → クライアント の DiagramInfo。
 * **JSON キーは `DiagramId`** であり `Id` ではない (TRViS 本体 WebSocketNetworkSyncService 仕様)。
 */
export interface ServerDiagramInfoMessage {
	MessageType: "DiagramInfo";
	DiagramId?: string | null;
	Name?: string | null;
	Description?: string | null;
	WorkGroupIds?: string[] | null;
}

/** サーバ → クライアント: 列車選択指示 (TRViS 側で表示中列車を切り替えさせる) */
export interface ServerSelectTrainMessage {
	MessageType: "SelectTrain";
	WorkGroupId?: string | null;
	WorkId?: string | null;
	TrainId?: string | null;
}

/** TRViS 側 OperationCommandType enum 名と一致させる必要がある */
export type OperationCommandAction =
	"StartOperation" | "EndOperation" | "EnableLocationService" | "DisableLocationService";

/** サーバ → クライアント: 運行操作コマンド */
export interface ServerOperationCommandMessage {
	MessageType: "OperationCommand";
	Action: OperationCommandAction;
}

/** サーバ → クライアント: タイトルバー色変更要求 */
export interface ServerHeaderColorMessage {
	MessageType: "HeaderColor";
	ResetToDefault: boolean;
	/** 0xRRGGBB の整数 (JSON 上は number。"#RRGGBB" 文字列ではない) */
	Color_RGB?: number | null;
}

/** サーバ → クライアント: 通告データ */
export interface ServerNotificationMessage {
	MessageType: "Notification";
	Id?: string | null;
	Title?: string | null;
	Body?: string | null;
	/** 0=通常, 1=重要 など (サーバ任意) */
	Priority: number;
	/** ISO8601 文字列 */
	IssuedAt?: string | null;
}

/** サーバ → クライアント: タイトルバー時刻表示フォーマット指定 */
export interface ServerTimeFormatMessage {
	MessageType: "TimeFormat";
	/** null / 省略 で端末既定にリセット */
	Format?: string | null;
}

/**
 * `SearchTrain.MatchMode` (v1.1 列番検索、一致方式)。
 * 前方一致 (既定) / 中間一致 / 完全一致。数字部分 (列車番号) のみが対象。
 */
export type TrainSearchMatchMode = "Prefix" | "Contains" | "Exact";

/**
 * `SearchTrain` の候補 1 件のサマリ (v1.1)。完全な時刻表は含まず、
 * 確定時に `RequestTrainTimetable` で別途取得する (2段階フロー)。
 */
export interface TrainSearchResultSummary {
	WorkGroupId?: string | null;
	WorkId?: string | null;
	TrainId?: string | null;
	TrainNumber?: string | null;
	WorkName?: string | null;
	/** -1 = Inbound / 1 = Outbound */
	Direction?: number | null;
	StartStationName?: string | null;
	StartTime?: string | null;
	EndStationName?: string | null;
	EndTime?: string | null;
}

/**
 * サーバ → クライアント: `SearchTrain` への応答 (v1.1)。
 * `RequestId` はクライアントが送った `SearchTrain.RequestId` を echo する。
 * `Results` は該当0件でも必ず送る (空配列 = 「該当なし」、無応答 = タイムアウトと区別するため)。
 */
export interface ServerSearchTrainResponseMessage {
	MessageType: "SearchTrainResponse";
	RequestId: string;
	Results: TrainSearchResultSummary[];
}

export type ServerMessage =
	| ServerSyncedDataMessage
	| ServerTimetableMessage
	| ServerInfoMessage
	| ServerDiagramInfoMessage
	| ServerSelectTrainMessage
	| ServerOperationCommandMessage
	| ServerHeaderColorMessage
	| ServerNotificationMessage
	| ServerTimeFormatMessage
	| ServerSearchTrainResponseMessage;

/* -------------------------------------------------------------------------- */
/*  Editor-internal types                                                     */
/* -------------------------------------------------------------------------- */

/** WebSocket接続状態 */
export type ConnectionStatus = "stopped" | "starting" | "listening" | "client-connected" | "error";

/** TRViSが現在表示している列車の識別 (クライアントから受信) */
export interface RemoteSelection {
	WorkGroupId?: string;
	WorkId?: string;
	TrainId?: string;
	/** 受信時刻 (Date.now()) */
	receivedAt: number;
}

/** エディタが現在編集中の列車の識別 */
export interface EditorSelection {
	workGroupId?: string;
	workId?: string;
	trainId?: string;
}

/**
 * エディタが `RequestServerInfo` への応答 / proactive broadcast で返す
 * サーバー情報。各フィールドは空文字なら未設定 (null) として送出する。
 */
export interface EditorServerInfo {
	Name: string;
	Admin: string;
	Version: string;
	/** TRViS NetworkSyncService 現行プロトコルは "1.1" (v1.1 で列車検索機能を追加)。 */
	ProtocolVersion: string;
	/**
	 * 列番検索機能 (`SearchTrain`/`RequestTrainTimetable`, v1.1) を広告 (`Features: ["TrainSearch"]`)
	 * し、要求に応答するかどうか。false の場合は `Features` を送らず、要求にも応答しない
	 * (クライアントはタイムアウトする)。
	 */
	TrainSearchEnabled: boolean;
}

/**
 * エディタが `RequestDiagramInfo` への応答 / proactive broadcast で返す
 * ダイヤ情報。エディタは 1 ドキュメント = 1 ダイヤとして扱う。
 *
 * `RequestDiagramInfo` に `DiagramId` 指定がある場合、その値が `DiagramId`
 * と一致するときのみ応答する (不一致・未設定時は無応答 = リファレンス
 * サーバ準拠。TRViS は応答が来ないことを許容する)。
 */
export interface EditorDiagramInfo {
	DiagramId: string;
	Name: string;
	Description: string;
	/** このダイヤに含まれる WorkGroup ID 一覧 (空なら送出時に null)。 */
	WorkGroupIds: string[];
}

/** 通信モニタが観測した 1 フレーム (実際にワイヤを流れた生 JSON 文字列)。 */
export interface MonitorFrame {
	/** 受信(in) / 送信(out) */
	direction: "in" | "out";
	/** 対象クライアントの内部 ID */
	clientId: string;
	/** ワイヤを流れた生のテキスト (整形しない) */
	json: string;
	/** UNIX epoch ミリ秒 (Rust 側で観測時刻を採番) */
	ts: number;
}

/** Tauri の `ws-monitor` イベントペイロード */
export type WsMonitorEvent =
	({ type: "frame" } & MonitorFrame) | { type: "lagged"; skipped: number };

/** Tauri側 WebSocketサーバから流れてくるイベント */
export type WsServerEvent =
	| { type: "started"; port: number; hosts: string[] }
	| { type: "stopped" }
	| { type: "client-connected"; clientId: string }
	| { type: "client-disconnected"; clientId: string }
	| { type: "id-update"; clientId: string; message: ClientIdUpdateMessage }
	| { type: "request-server-info"; clientId: string }
	| { type: "request-diagram-info"; clientId: string; diagramId: string | null }
	| {
			type: "search-train";
			clientId: string;
			requestId: string | null;
			trainNumber: string | null;
			/** 省略時・未知の値は "Prefix" (前方一致) として扱う。 */
			matchMode: string | null;
	  }
	| {
			type: "request-train-timetable";
			clientId: string;
			requestId: string | null;
			workGroupId: string | null;
			workId: string | null;
			trainId: string | null;
	  }
	| { type: "error"; message: string };
