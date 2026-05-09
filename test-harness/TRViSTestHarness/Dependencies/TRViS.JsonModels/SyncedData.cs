namespace TRViS.JsonModels;

public class SyncedData(
	double? Location_m,
	long? Time_ms,
	bool? CanStart
) {
	public static readonly string WORK_GROUP_ID_QUERY_KEY = "workgroup";
	public static readonly string WORK_ID_QUERY_KEY = "work";
	public static readonly string TRAIN_ID_QUERY_KEY = "train";

	public double? Location_m { get; } = Location_m;
	public long? Time_ms { get; } = Time_ms;
	public bool? CanStart { get; } = CanStart;

	public SyncedData() : this(null, null, null) { }
}
