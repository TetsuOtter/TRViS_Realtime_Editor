using System.Text.Json;
using TRViS.JsonModels;

namespace TRViSTestHarness;

public class TimetableCache
{
    private static readonly JsonSerializerOptions DeserOpts = new()
    {
        AllowTrailingCommas = true,
        PropertyNameCaseInsensitive = true,
    };

    private readonly object _lock = new();

    // keyed by WorkGroup.Id
    private readonly Dictionary<string, WorkGroupData> _workGroups = [];

    private SyncedData? _lastSync;
    private string? _lastRawMessage;
    private long _messageCount;

    public string? LastRawMessage => _lastRawMessage;
    public long MessageCount => Interlocked.Read(ref _messageCount);

    public void ProcessMessage(string json)
    {
        _lastRawMessage = json;

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            string? msgType = null;
            if (root.TryGetProperty("MessageType", out var mt)) msgType = mt.GetString();

            if (msgType == "Timetable")
                ProcessTimetable(root);
            else if (msgType == "SyncedData")
                ProcessSyncedData(root);
        }
        catch { /* ignore invalid JSON */ }

        Interlocked.Increment(ref _messageCount);
    }

    private void ProcessTimetable(JsonElement root)
    {
        if (!root.TryGetProperty("Data", out var dataEl)) return;
        var rawData = dataEl.GetRawText();

        string? wgId = root.TryGetProperty("WorkGroupId", out var wgEl) ? wgEl.GetString() : null;
        string? wId = root.TryGetProperty("WorkId", out var wEl) ? wEl.GetString() : null;
        string? tId = root.TryGetProperty("TrainId", out var tEl) ? tEl.GetString() : null;

        lock (_lock)
        {
            if (tId is not null)
            {
                // Train scope
                var train = JsonSerializer.Deserialize<TrainData>(rawData, DeserOpts);
                if (train is null) return;
                UpdateTrain(tId, train, wId);
            }
            else if (wId is not null && wgId is not null)
            {
                // Work scope
                var work = JsonSerializer.Deserialize<WorkData>(rawData, DeserOpts);
                if (work is null) return;
                EnsureWorkGroup(wgId);
                UpdateWork(wgId, wId, work);
            }
            else if (wgId is not null)
            {
                // WorkGroup scope
                var wg = JsonSerializer.Deserialize<WorkGroupData>(rawData, DeserOpts);
                if (wg is null) return;
                _workGroups[wgId] = wg;
            }
            else
            {
                // All scope
                var all = JsonSerializer.Deserialize<WorkGroupData[]>(rawData, DeserOpts);
                if (all is null) return;
                _workGroups.Clear();
                foreach (var wg in all)
                {
                    if (wg.Id is not null)
                        _workGroups[wg.Id] = wg;
                    else
                        _workGroups[Guid.NewGuid().ToString()] = wg;
                }
            }
        }
    }

    private void EnsureWorkGroup(string wgId)
    {
        if (!_workGroups.ContainsKey(wgId))
            _workGroups[wgId] = new WorkGroupData(wgId, "", null, []);
    }

    private void UpdateWork(string wgId, string wId, WorkData newWork)
    {
        var wg = _workGroups[wgId];
        var works = wg.Works.ToList();
        var idx = works.FindIndex(w => w.Id == wId);
        if (idx >= 0) works[idx] = newWork;
        else works.Add(newWork);
        _workGroups[wgId] = new WorkGroupData(wg.Id, wg.Name, wg.DBVersion, [.. works]);
    }

    private void UpdateTrain(string tId, TrainData newTrain, string? wId)
    {
        // Find which work contains this train and update it
        foreach (var (wgId, wg) in _workGroups)
        {
            var works = wg.Works.ToList();
            for (int i = 0; i < works.Count; i++)
            {
                var work = works[i];
                if (wId is not null && work.Id != wId) continue;
                var trains = work.Trains.ToList();
                var tIdx = trains.FindIndex(t => t.Id == tId);
                if (tIdx < 0 && wId is null) continue;
                if (tIdx >= 0) trains[tIdx] = newTrain;
                else trains.Add(newTrain);
                works[i] = new WorkData(
                    work.Id, work.Name, work.AffectDate, work.AffixContentType,
                    work.AffixContent, work.Remarks, work.HasETrainTimetable,
                    work.ETrainTimetableContentType, work.ETrainTimetableContent,
                    [.. trains]);
                _workGroups[wgId] = new WorkGroupData(wg.Id, wg.Name, wg.DBVersion, [.. works]);
                return;
            }
        }
    }

    private void ProcessSyncedData(JsonElement root)
    {
        double? loc = null;
        if (root.TryGetProperty("Location_m", out var locEl) && locEl.ValueKind != JsonValueKind.Null)
            loc = locEl.GetDouble();

        long? time = null;
        if (root.TryGetProperty("Time_ms", out var timeEl) && timeEl.ValueKind != JsonValueKind.Null)
            time = timeEl.GetInt64();

        bool? canStart = null;
        if (root.TryGetProperty("CanStart", out var csEl) && csEl.ValueKind != JsonValueKind.Null)
            canStart = csEl.GetBoolean();

        lock (_lock) { _lastSync = new SyncedData(loc, time, canStart); }
    }

    public WorkGroupData[] GetWorkGroups()
    {
        lock (_lock) { return [.. _workGroups.Values]; }
    }

    public WorkGroupData? GetWorkGroup(string id)
    {
        lock (_lock) { return _workGroups.GetValueOrDefault(id); }
    }

    public WorkData? GetWork(string wgId, string wId)
    {
        lock (_lock)
        {
            if (!_workGroups.TryGetValue(wgId, out var wg)) return null;
            return wg.Works.FirstOrDefault(w => w.Id == wId);
        }
    }

    public WorkData? GetWorkById(string wId)
    {
        lock (_lock)
        {
            foreach (var wg in _workGroups.Values)
            {
                var w = wg.Works.FirstOrDefault(w => w.Id == wId);
                if (w is not null) return w;
            }
            return null;
        }
    }

    public TrainData? GetTrain(string tId)
    {
        lock (_lock)
        {
            foreach (var wg in _workGroups.Values)
                foreach (var w in wg.Works)
                {
                    var t = w.Trains.FirstOrDefault(t => t.Id == tId);
                    if (t is not null) return t;
                }
            return null;
        }
    }

    public TimetableRowData? GetTimetableRowById(string rowId)
    {
        lock (_lock)
        {
            foreach (var wg in _workGroups.Values)
                foreach (var w in wg.Works)
                    foreach (var t in w.Trains)
                    {
                        var r = t.TimetableRows.FirstOrDefault(r => r.Id == rowId);
                        if (r is not null) return r;
                    }
            return null;
        }
    }

    public SyncedData? GetLastSync()
    {
        lock (_lock) { return _lastSync; }
    }
}
