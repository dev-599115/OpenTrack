using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using OpenTrack.Api.Models;
using OpenTrack.Api.Options;

namespace OpenTrack.Api.Services;

public interface IOpenTrackClient
{
    Task<ContainerDto> TrackContainerAsync(string containerId, string scacCode, string masterBillNumber, IDictionary<string, string>? referenceNumbers, CancellationToken ct);
    Task<ContainerDto> GetContainerAsync(string containerId, CancellationToken ct);
    Task<JsonElement> GetRouteAsync(string containerId, CancellationToken ct);
    Task<MasterBillDto> TrackMasterBillAsync(string number, string? scacCode, IDictionary<string, string>? referenceNumbers, CancellationToken ct);
    Task<MasterBillDto> GetMasterBillAsync(string number, CancellationToken ct);
    Task<JsonElement> GetEventsAsync(long sinceUnix, string? containerId, int? page, int? perPage, CancellationToken ct);
    Task<JsonElement> ListWebhooksAsync(CancellationToken ct);
    Task<JsonElement> RegisterWebhookAsync(RegisterWebhookRequest request, CancellationToken ct);
    Task UnregisterWebhookAsync(string webhookId, CancellationToken ct);
}

/// <summary>Typed HttpClient for api.opentrack.co. The API key header is attached in DI (Program.cs).</summary>
public sealed class OpenTrackClient(HttpClient http, IOptions<OpenTrackOptions> options) : IOpenTrackClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static string Esc(string v) => Uri.EscapeDataString(v);

    public Task<ContainerDto> TrackContainerAsync(string containerId, string scacCode, string masterBillNumber,
        IDictionary<string, string>? referenceNumbers, CancellationToken ct) =>
        SendAsync<ContainerDto>(HttpMethod.Post, $"v1/containers/{Esc(containerId)}",
            new { scacCode, masterBillNumber, referenceNumbers }, ct);

    public Task<ContainerDto> GetContainerAsync(string containerId, CancellationToken ct) =>
        SendAsync<ContainerDto>(HttpMethod.Get, $"v1/containers/{Esc(containerId)}", null, ct);

    public Task<JsonElement> GetRouteAsync(string containerId, CancellationToken ct) =>
        SendAsync<JsonElement>(HttpMethod.Get, $"v1/routes/{Esc(containerId)}", null, ct);

    public Task<MasterBillDto> TrackMasterBillAsync(string number, string? scacCode,
        IDictionary<string, string>? referenceNumbers, CancellationToken ct) =>
        SendAsync<MasterBillDto>(HttpMethod.Post, $"v1/master-bills/{Esc(number)}", new { scacCode, referenceNumbers }, ct);

    public Task<MasterBillDto> GetMasterBillAsync(string number, CancellationToken ct) =>
        SendAsync<MasterBillDto>(HttpMethod.Get, $"v1/master-bills/{Esc(number)}", null, ct);

    public Task<JsonElement> GetEventsAsync(long sinceUnix, string? containerId, int? page, int? perPage, CancellationToken ct)
    {
        var query = new Dictionary<string, string?> { ["timestamp"] = sinceUnix.ToString() };
        if (!string.IsNullOrWhiteSpace(containerId)) query["containerId"] = containerId;
        if (page is not null) query["page"] = page.ToString();
        if (perPage is not null) query["perPage"] = Math.Min(perPage.Value, 25).ToString(); // upstream cap is 25
        return SendAsync<JsonElement>(HttpMethod.Get, QueryHelpers.AddQueryString("v1/events", query), null, ct);
    }

    public Task<JsonElement> ListWebhooksAsync(CancellationToken ct) =>
        SendAsync<JsonElement>(HttpMethod.Get, "v1/webhooks", null, ct);

    public Task<JsonElement> RegisterWebhookAsync(RegisterWebhookRequest r, CancellationToken ct) =>
        SendAsync<JsonElement>(HttpMethod.Post, "v1/webhooks", new
        {
            url = r.Url,
            name = r.Name,
            events = r.Events is { Length: > 0 } ? r.Events : null,
            secret = options.Value.WebhookSecret
        }, ct);

    public async Task UnregisterWebhookAsync(string webhookId, CancellationToken ct)
    {
        using var res = await http.SendAsync(new HttpRequestMessage(HttpMethod.Delete, $"v1/webhooks/{Esc(webhookId)}"), ct);
        if (!res.IsSuccessStatusCode) throw await OpenTrackApiException.FromResponseAsync(res, ct);
    }

    private async Task<T> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(method, path);
        if (body is not null) req.Content = JsonContent.Create(body, mediaType: null, options: Json);

        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode) throw await OpenTrackApiException.FromResponseAsync(res, ct);

        var result = await res.Content.ReadFromJsonAsync<T>(Json, ct);
        return result ?? throw new OpenTrackApiException(502, "OpenTrack returned an empty response.");
    }
}
