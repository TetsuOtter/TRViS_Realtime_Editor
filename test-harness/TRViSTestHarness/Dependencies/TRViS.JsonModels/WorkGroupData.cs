using System;
using System.Linq;

namespace TRViS.JsonModels;

public class WorkGroupData(
	string? Id,
	string Name,
	int? DBVersion,
	WorkData[] Works
) : IEquatable<WorkGroupData>
{
	public string? Id { get; } = Id;
	public string Name { get; } = Name;
	public int? DBVersion { get; } = DBVersion;
	public WorkData[] Works { get; } = Works;

	public override string ToString() =>
		$"{nameof(WorkGroupData)}{{'{Id}', '{Name}', {nameof(DBVersion)}:{DBVersion}, {nameof(Works)}: {Works.Length} works}}";

	public bool Equals(WorkGroupData? other)
	{
		if (other is null)
			return false;
		if (ReferenceEquals(this, other))
			return true;

		return (
			Id == other.Id &&
			Name == other.Name &&
			DBVersion == other.DBVersion &&
			Works.SequenceEqual(other.Works)
		);
	}

	public override bool Equals(object? obj) => Equals(obj as WorkGroupData);

	public override int GetHashCode() =>
		(Id?.GetHashCode() ?? 0) ^
		Name.GetHashCode() ^
		DBVersion.GetHashCode() ^
		Works.GetHashCode();
}
