using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using TRViS.JsonModels;
using TRViSTestHarness;

namespace TRViSTestHarness;

public static class ApiHelper
{
    public static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        PropertyNameCaseInsensitive = true,
    };

    public static object? ResolveObject(string type, string? id, TimetableCache c) => type switch
    {
        "WorkGroup" => id is not null ? c.GetWorkGroup(id) : null,
        "Work" => id is not null ? c.GetWorkById(id) : null,
        "Train" => id is not null ? c.GetTrain(id) : null,
        "TimetableRow" => id is not null ? c.GetTimetableRowById(id) : null,
        "SyncedData" => c.GetLastSync(),
        _ => null,
    };

    public static Type? ResolveType(string type) => type switch
    {
        "WorkGroupData" => typeof(WorkGroupData),
        "WorkData" => typeof(WorkData),
        "TrainData" => typeof(TrainData),
        "TimetableRowData" => typeof(TimetableRowData),
        "SyncedData" => typeof(SyncedData),
        _ => null,
    };
}
