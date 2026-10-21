using System.Net.Http.Json;

namespace OpenTrack.Api.Services;

/// <summary>Raised when OpenTrack answers with a non-2xx status.</summary>
public sealed class OpenTrackApiException(int statusCode, string message, string? code = null, int? retryAfterSeconds = null,
    Exception? inner = null)
    : Exception(message, inner)
{
    public int StatusCode { get; } = statusCode;
    public string? Code { get; } = code;
    public int? RetryAfterSeconds { get; } = retryAfterSeconds;

    private sealed record UpstreamError(string? Message, string? Code);

    public static async Task<OpenTrackApiException> FromResponseAsync(HttpResponseMessage res, CancellationToken ct)
    {
        string? message = null, code = null;
        try
        {
            var body = await res.Content.ReadFromJsonAsync<UpstreamError>(ct);
            message = body?.Message;
            code = body?.Code;
        }
        catch { /* non-JSON error body */ }

        int? retry = res.Headers.RetryAfter?.Delta is { } d ? (int)d.TotalSeconds : null;
        return new((int)res.StatusCode, message ?? res.ReasonPhrase ?? "OpenTrack request failed", code, retry);
    }
}
