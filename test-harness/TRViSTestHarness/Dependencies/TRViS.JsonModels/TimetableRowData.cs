using System;

namespace TRViS.JsonModels;

public class TimetableRowData(
	string? Id,
	string StationName,
	double Location_m,
	double? Longitude_deg,
	double? Latitude_deg,
	double? OnStationDetectRadius_m,
	string? FullName,
	int? RecordType,

	string? TrackName,

	int? DriveTime_MM,
	int? DriveTime_SS,
	bool? IsOperationOnlyStop,
	bool? IsPass,
	bool? HasBracket,
	bool? IsLastStop,
	string? Arrive,
	string? Departure,
	int? RunInLimit,
	int? RunOutLimit,
	string? Remarks,
	string? MarkerColor,
	string? MarkerText,
	int? WorkType
) : IEquatable<TimetableRowData>
{
	public string? Id { get; } = Id;
	public string StationName { get; } = StationName;
	public double Location_m { get; } = Location_m;
	public double? Longitude_deg { get; } = Longitude_deg;
	public double? Latitude_deg { get; } = Latitude_deg;
	public double? OnStationDetectRadius_m { get; } = OnStationDetectRadius_m;
	public string? FullName { get; } = FullName;
	public int? RecordType { get; } = RecordType;

	public string? TrackName { get; } = TrackName;

	public int? DriveTime_MM { get; } = DriveTime_MM;
	public int? DriveTime_SS { get; } = DriveTime_SS;
	public bool? IsOperationOnlyStop { get; } = IsOperationOnlyStop;
	public bool? IsPass { get; } = IsPass;
	public bool? HasBracket { get; } = HasBracket;
	public bool? IsLastStop { get; } = IsLastStop;
	public string? Arrive { get; } = Arrive;
	public string? Departure { get; } = Departure;
	public int? RunInLimit { get; } = RunInLimit;
	public int? RunOutLimit { get; } = RunOutLimit;
	public string? Remarks { get; } = Remarks;
	public string? MarkerColor { get; } = MarkerColor;
	public string? MarkerText { get; } = MarkerText;
	public int? WorkType { get; } = WorkType;

	public override string ToString() =>
		$"{nameof(TimetableRowData)}{{'{StationName}'(ID: '{Id}', FullName: '{FullName}') @ {Location_m}m (lon:{Longitude_deg}, lat:{Latitude_deg}), OnStationDetectRadius: {OnStationDetectRadius_m}m, "
		+ $"{nameof(RecordType)}:{RecordType}, {nameof(TrackName)}:'{TrackName}', DriveTime:'{DriveTime_MM}:{DriveTime_SS}', "
		+ $"{nameof(IsOperationOnlyStop)}{IsOperationOnlyStop}, {nameof(IsPass)}{IsPass}, {nameof(HasBracket)}{HasBracket}, {nameof(IsLastStop)}{IsLastStop},"
		+ $"{nameof(Arrive)}:'{Arrive}', {nameof(Departure)}:'{Departure}', {nameof(RunInLimit)}:{RunInLimit}, {nameof(RunOutLimit)}{RunOutLimit},"
		+ $"{nameof(Remarks)}:'{Remarks}', {nameof(MarkerColor)}:'{MarkerColor}', {nameof(MarkerText)}:'{MarkerText}', {nameof(WorkType)}:{WorkType}}}";

	public bool Equals(TimetableRowData? other)
	{
		if (other is null)
			return false;

		if (ReferenceEquals(this, other))
			return true;

		return (
			Id == other.Id &&
			StationName == other.StationName &&
			Location_m == other.Location_m &&
			Longitude_deg == other.Longitude_deg &&
			Latitude_deg == other.Latitude_deg &&
			OnStationDetectRadius_m == other.OnStationDetectRadius_m &&
			FullName == other.FullName &&
			RecordType == other.RecordType &&
			TrackName == other.TrackName &&
			DriveTime_MM == other.DriveTime_MM &&
			DriveTime_SS == other.DriveTime_SS &&
			IsOperationOnlyStop == other.IsOperationOnlyStop &&
			IsPass == other.IsPass &&
			HasBracket == other.HasBracket &&
			IsLastStop == other.IsLastStop &&
			Arrive == other.Arrive &&
			Departure == other.Departure &&
			RunInLimit == other.RunInLimit &&
			RunOutLimit == other.RunOutLimit &&
			Remarks == other.Remarks &&
			MarkerColor == other.MarkerColor &&
			MarkerText == other.MarkerText &&
			WorkType == other.WorkType
		);
	}

	public override bool Equals(object? obj) => Equals(obj as TimetableRowData);

	public override int GetHashCode() =>
		(Id?.GetHashCode() ?? 0) ^
		StationName.GetHashCode() ^
		Location_m.GetHashCode() ^
		Longitude_deg.GetHashCode() ^
		Latitude_deg.GetHashCode() ^
		OnStationDetectRadius_m.GetHashCode() ^
		(FullName?.GetHashCode() ?? 0) ^
		RecordType.GetHashCode() ^
		(TrackName?.GetHashCode() ?? 0) ^
		DriveTime_MM.GetHashCode() ^
		DriveTime_SS.GetHashCode() ^
		IsOperationOnlyStop.GetHashCode() ^
		IsPass.GetHashCode() ^
		HasBracket.GetHashCode() ^
		IsLastStop.GetHashCode() ^
		(Arrive?.GetHashCode() ?? 0) ^
		(Departure?.GetHashCode() ?? 0) ^
		RunInLimit.GetHashCode() ^
		RunOutLimit.GetHashCode() ^
		(Remarks?.GetHashCode() ?? 0) ^
		(MarkerColor?.GetHashCode() ?? 0) ^
		(MarkerText?.GetHashCode() ?? 0) ^
		WorkType.GetHashCode();
}
