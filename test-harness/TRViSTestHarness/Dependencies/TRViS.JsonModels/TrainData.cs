using System;
using System.Linq;

namespace TRViS.JsonModels;

public class TrainData(
	string? Id,
	string TrainNumber,
	string? MaxSpeed,
	string? SpeedType,
	string? NominalTractiveCapacity,
	int? CarCount,
	string? Destination,
	string? BeginRemarks,
	string? AfterRemarks,
	string? Remarks,
	string? BeforeDeparture,
	string? TrainInfo,
	int Direction,
	int? WorkType,
	string? AfterArrive,
	string? BeforeDeparture_OnStationTrackCol,
	string? AfterArrive_OnStationTrackCol,
	int? DayCount,
	bool? IsRideOnMoving,
	string? Color,
	TimetableRowData[] TimetableRows,
	string? NextTrainId
) : IEquatable<TrainData>
{
	public string? Id { get; } = Id;
	public string TrainNumber { get; } = TrainNumber;
	public string? MaxSpeed { get; } = MaxSpeed;
	public string? SpeedType { get; } = SpeedType;
	public string? NominalTractiveCapacity { get; } = NominalTractiveCapacity;
	public int? CarCount { get; } = CarCount;
	public string? Destination { get; } = Destination;
	public string? BeginRemarks { get; } = BeginRemarks;
	public string? AfterRemarks { get; } = AfterRemarks;
	public string? Remarks { get; } = Remarks;
	public string? BeforeDeparture { get; } = BeforeDeparture;
	public string? TrainInfo { get; } = TrainInfo;
	public int Direction { get; } = Direction;
	public int? WorkType { get; } = WorkType;
	public string? AfterArrive { get; } = AfterArrive;
	public string? BeforeDeparture_OnStationTrackCol { get; } = BeforeDeparture_OnStationTrackCol;
	public string? AfterArrive_OnStationTrackCol { get; } = AfterArrive_OnStationTrackCol;
	public int? DayCount { get; } = DayCount;
	public bool? IsRideOnMoving { get; } = IsRideOnMoving;
	public string? Color { get; } = Color;
	public TimetableRowData[] TimetableRows { get; } = TimetableRows;
	public string? NextTrainId { get; } = NextTrainId;

	public override string ToString() =>
		$"{nameof(TrainData)}{{'{Id}', '{TrainNumber}', {nameof(Direction)}:{Direction}, {nameof(Destination)}:'{Destination}', {CarCount} cars, "
		+ $"{nameof(NominalTractiveCapacity)}:'{NominalTractiveCapacity}', {nameof(MaxSpeed)}:'{MaxSpeed}', {nameof(SpeedType)}:'{SpeedType}', {nameof(WorkType)}:{WorkType}, Day{DayCount}, {nameof(Color)}:'{Color}', {nameof(IsRideOnMoving)}:{IsRideOnMoving}, "
		+ $"{nameof(BeginRemarks)}:'{BeginRemarks}', {nameof(AfterRemarks)}:'{AfterRemarks}', {nameof(Remarks)}:'{Remarks}', {nameof(BeforeDeparture)}:'{BeforeDeparture}', {nameof(TrainInfo)}:'{TrainInfo}', "
		+ $"{nameof(AfterArrive)}:'{AfterArrive}', {nameof(BeforeDeparture_OnStationTrackCol)}:'{BeforeDeparture_OnStationTrackCol}', {nameof(AfterArrive_OnStationTrackCol)}:'{AfterArrive_OnStationTrackCol}', "
		+ $"{nameof(TimetableRows)}: {TimetableRows.Length} rows, {nameof(NextTrainId)}:'{NextTrainId}'}}";

	public bool Equals(TrainData? other)
	{
		if (other is null)
			return false;
		if (ReferenceEquals(this, other))
			return true;

		return (
			Id == other.Id &&
			TrainNumber == other.TrainNumber &&
			MaxSpeed == other.MaxSpeed &&
			SpeedType == other.SpeedType &&
			NominalTractiveCapacity == other.NominalTractiveCapacity &&
			CarCount == other.CarCount &&
			Destination == other.Destination &&
			BeginRemarks == other.BeginRemarks &&
			AfterRemarks == other.AfterRemarks &&
			Remarks == other.Remarks &&
			BeforeDeparture == other.BeforeDeparture &&
			TrainInfo == other.TrainInfo &&
			Direction == other.Direction &&
			WorkType == other.WorkType &&
			AfterArrive == other.AfterArrive &&
			BeforeDeparture_OnStationTrackCol == other.BeforeDeparture_OnStationTrackCol &&
			AfterArrive_OnStationTrackCol == other.AfterArrive_OnStationTrackCol &&
			DayCount == other.DayCount &&
			IsRideOnMoving == other.IsRideOnMoving &&
			Color == other.Color &&
			TimetableRows.SequenceEqual(other.TimetableRows) &&
			NextTrainId == other.NextTrainId
		);
	}

	public override bool Equals(object? obj) => Equals(obj as TrainData);

	public override int GetHashCode() =>
		(Id?.GetHashCode() ?? 0) ^
		TrainNumber.GetHashCode() ^
		(MaxSpeed?.GetHashCode() ?? 0) ^
		(SpeedType?.GetHashCode() ?? 0) ^
		(NominalTractiveCapacity?.GetHashCode() ?? 0) ^
		CarCount.GetHashCode() ^
		(Destination?.GetHashCode() ?? 0) ^
		(BeginRemarks?.GetHashCode() ?? 0) ^
		(AfterRemarks?.GetHashCode() ?? 0) ^
		(Remarks?.GetHashCode() ?? 0) ^
		(BeforeDeparture?.GetHashCode() ?? 0) ^
		(TrainInfo?.GetHashCode() ?? 0) ^
		Direction.GetHashCode() ^
		WorkType.GetHashCode() ^
		(AfterArrive?.GetHashCode() ?? 0) ^
		(BeforeDeparture_OnStationTrackCol?.GetHashCode() ?? 0) ^
		(AfterArrive_OnStationTrackCol?.GetHashCode() ?? 0) ^
		DayCount.GetHashCode() ^
		IsRideOnMoving.GetHashCode() ^
		(Color?.GetHashCode() ?? 0) ^
		TimetableRows.GetHashCode() ^
		(NextTrainId?.GetHashCode() ?? 0);
}
