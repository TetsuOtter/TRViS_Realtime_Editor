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

export type ServerMessage = ServerSyncedDataMessage | ServerTimetableMessage;

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

/** Tauri側 WebSocketサーバから流れてくるイベント */
export type WsServerEvent =
	| { type: "started"; port: number; hosts: string[] }
	| { type: "stopped" }
	| { type: "client-connected"; clientId: string }
	| { type: "client-disconnected"; clientId: string }
	| { type: "id-update"; clientId: string; message: ClientIdUpdateMessage }
	| { type: "error"; message: string };
