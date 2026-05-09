using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using TRViS.JsonModels;
using TRViSTestHarness;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<TimetableCache>();

var app = builder.Build();

var cache = app.Services.GetRequiredService<TimetableCache>();

// Start WebSocket client in background
var wsUrl = Environment.GetEnvironmentVariable("TRVIS_WS_URL") ?? "ws://localhost:23519/ws";
_ = Task.Run(() => WsClientRunner.Run(wsUrl, cache, app.Lifetime.ApplicationStopping));

// HTTP API
app.MapGet("/health", () => "ok");

app.MapGet("/received/work-groups", (TimetableCache c) =>
    Results.Json(c.GetWorkGroups(), ApiHelper.JsonOpts));

app.MapGet("/received/work-group/{wgId}", (string wgId, TimetableCache c) =>
{
    var wg = c.GetWorkGroup(wgId);
    return wg is null ? Results.NotFound() : Results.Json(wg, ApiHelper.JsonOpts);
});

app.MapGet("/received/work/{wgId}/{wId}", (string wgId, string wId, TimetableCache c) =>
{
    var work = c.GetWork(wgId, wId);
    return work is null ? Results.NotFound() : Results.Json(work, ApiHelper.JsonOpts);
});

app.MapGet("/received/train/{tId}", (string tId, TimetableCache c) =>
{
    var train = c.GetTrain(tId);
    return train is null ? Results.NotFound() : Results.Json(train, ApiHelper.JsonOpts);
});

app.MapGet("/received/timetable-row/{tId}/{rowId}", (string tId, string rowId, TimetableCache c) =>
{
    var train = c.GetTrain(tId);
    if (train is null) return Results.NotFound();
    var row = train.TimetableRows.FirstOrDefault(r => r.Id == rowId);
    return row is null ? Results.NotFound() : Results.Json(row, ApiHelper.JsonOpts);
});

app.MapGet("/received/property", (string type, string? id, string path, TimetableCache c) =>
{
    object? obj = ApiHelper.ResolveObject(type, id, c);
    if (obj is null) return Results.NotFound();

    var prop = obj.GetType().GetProperty(path, BindingFlags.Public | BindingFlags.Instance);
    if (prop is null) return Results.NotFound();

    return Results.Json(new { name = prop.Name, value = prop.GetValue(obj) }, ApiHelper.JsonOpts);
});

app.MapGet("/received/all-properties", (string type, string? id, TimetableCache c) =>
{
    object? obj = ApiHelper.ResolveObject(type, id, c);
    if (obj is null) return Results.NotFound();

    var props = obj.GetType()
        .GetProperties(BindingFlags.Public | BindingFlags.Instance)
        .Select(p => new { name = p.Name, value = p.GetValue(obj) })
        .ToArray();

    return Results.Json(props, ApiHelper.JsonOpts);
});

app.MapGet("/received/property-names", (string type) =>
{
    var t = ApiHelper.ResolveType(type);
    if (t is null) return Results.NotFound();

    var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                 .Select(p => p.Name)
                 .ToArray();
    return Results.Json(names, ApiHelper.JsonOpts);
});

app.MapGet("/received/sync", (TimetableCache c) =>
    Results.Json(c.GetLastSync(), ApiHelper.JsonOpts));

app.MapGet("/received/raw-last-message", (TimetableCache c) =>
    Results.Text(c.LastRawMessage ?? "(none)"));

app.MapGet("/received/message-count", (TimetableCache c) =>
    Results.Json(c.MessageCount));

app.Run();
