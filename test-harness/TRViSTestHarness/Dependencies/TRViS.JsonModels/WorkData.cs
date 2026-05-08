using System;
using System.Linq;

namespace TRViS.JsonModels;

public class WorkData(
	string? Id,
	string Name,
	string? AffectDate,
	int? AffixContentType,
	string? AffixContent,
	string? Remarks,
	bool? HasETrainTimetable,
	int? ETrainTimetableContentType,
	string? ETrainTimetableContent,
	TrainData[] Trains
) : IEquatable<WorkData>
{
	public string? Id { get; } = Id;
	public string Name { get; } = Name;
	public string? AffectDate { get; } = AffectDate;
	public int? AffixContentType { get; } = AffixContentType;
	public string? AffixContent { get; } = AffixContent;
	public string? Remarks { get; } = Remarks;
	public bool? HasETrainTimetable { get; } = HasETrainTimetable;
	public int? ETrainTimetableContentType { get; } = ETrainTimetableContentType;
	public string? ETrainTimetableContent { get; } = ETrainTimetableContent;
	public TrainData[] Trains { get; } = Trains;

	public override string ToString() =>
		$"{nameof(WorkData)}{{'{Id}', '{Name}', {nameof(AffectDate)}:'{AffectDate}', {nameof(AffixContentType)}:{AffixContentType}, {nameof(AffixContent)}:'{AffixContent}', {nameof(Remarks)}:'{Remarks}', "
		+ $"{nameof(HasETrainTimetable)}:{HasETrainTimetable}, {nameof(ETrainTimetableContentType)}:{ETrainTimetableContentType}, {nameof(ETrainTimetableContent)}:'{ETrainTimetableContent}', "
		+ $"{nameof(Trains)}: {Trains.Length} trains}}";

	public bool Equals(WorkData? other)
	{
		if (other is null)
			return false;
		if (ReferenceEquals(this, other))
			return true;

		return (
			Id == other.Id &&
			Name == other.Name &&
			AffectDate == other.AffectDate &&
			AffixContentType == other.AffixContentType &&
			AffixContent == other.AffixContent &&
			Remarks == other.Remarks &&
			HasETrainTimetable == other.HasETrainTimetable &&
			ETrainTimetableContentType == other.ETrainTimetableContentType &&
			ETrainTimetableContent == other.ETrainTimetableContent &&
			Trains.SequenceEqual(other.Trains)
		);
	}

	public override bool Equals(object? obj) => Equals(obj as WorkData);

	public override int GetHashCode() =>
		(Id?.GetHashCode() ?? 0) ^
		Name.GetHashCode() ^
		(AffectDate?.GetHashCode() ?? 0) ^
		AffixContentType.GetHashCode() ^
		(AffixContent?.GetHashCode() ?? 0) ^
		(Remarks?.GetHashCode() ?? 0) ^
		HasETrainTimetable.GetHashCode() ^
		ETrainTimetableContentType.GetHashCode() ^
		(ETrainTimetableContent?.GetHashCode() ?? 0) ^
		Trains.GetHashCode();
}
