using System.Net.WebSockets;
using System.Text;

namespace TRViSTestHarness;

public static class WsClientRunner
{
    public static async Task Run(string url, TimetableCache cache, CancellationToken ct)
    {
        var logger = LoggerFactory.Create(b => b.AddConsole()).CreateLogger("WsClient");

        while (!ct.IsCancellationRequested)
        {
            using var ws = new ClientWebSocket();
            try
            {
                logger.LogInformation("Connecting to {Url}", url);
                await ws.ConnectAsync(new Uri(url), ct);
                logger.LogInformation("Connected to WS server");

                var buf = new byte[1024 * 64];
                var sb = new StringBuilder();

                while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
                {
                    var result = await ws.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "closing", CancellationToken.None);
                        break;
                    }
                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        sb.Append(Encoding.UTF8.GetString(buf, 0, result.Count));
                        if (result.EndOfMessage)
                        {
                            var msg = sb.ToString();
                            sb.Clear();
                            cache.ProcessMessage(msg);
                        }
                    }
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "WS error, reconnecting in 1s");
                try { await Task.Delay(1000, ct); } catch { break; }
            }
        }
    }
}
