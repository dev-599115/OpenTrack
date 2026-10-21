using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using OpenTrack.Api.Models;

namespace OpenTrack.Api.Services;

public sealed class BookingsApiException(int statusCode, string message, Exception? inner = null) : Exception(message, inner)
{
    public int StatusCode { get; } = statusCode;

    /// <summary>Pulls "detail" (or "title") out of an RFC 7807 body; null when the body isn't JSON.</summary>
    public static string? ExtractDetail(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            foreach (var key in new[] { "detail", "title" })
                if (root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()))
                    return v.GetString();
        }
        catch (JsonException) { /* plain-text body */ }
        return null;
    }
}

public interface IBookingsClient
{
    Task<IReadOnlyList<BookingDto>> ListAsync(BookingQuery query, CancellationToken ct);
}

/// <summary>Typed HttpClient for the bookings service. Base address is attached in DI (Program.cs).</summary>
public sealed class BookingsClient(HttpClient http, ILogger<BookingsClient> log) : IBookingsClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // Property names commonly used by APIs that wrap a list in an envelope object.
    private static readonly string[] EnvelopeKeys =
        ["data", "items", "results", "result", "value", "values", "bookings", "containers", "records", "rows"];

    public async Task<IReadOnlyList<BookingDto>> ListAsync(BookingQuery q, CancellationToken ct)
    {
        if (http.BaseAddress is null)
            throw new BookingsApiException(503, "The bookings service is not configured (set Bookings:BaseUrl).");

        var query = new Dictionary<string, string?> { ["UserCountry"] = q.UserCountry.Trim() };
        if (q.Cutoff is { } cutoff) query["Cutoff"] = cutoff.UtcDateTime.ToString("O", CultureInfo.InvariantCulture);
        if (!string.IsNullOrWhiteSpace(q.JobNo)) query["JobNo"] = q.JobNo.Trim();
        if (!string.IsNullOrWhiteSpace(q.Search)) query["Search"] = q.Search.Trim();
        if (!string.IsNullOrWhiteSpace(q.ContainerNo)) query["ContainerNo"] = q.ContainerNo.Trim().ToUpperInvariant();

        using var res = await http.GetAsync(QueryHelpers.AddQueryString("api/OpenTrack", query), ct);

        // The service labels its JSON as text/plain, which ReadFromJsonAsync refuses; read the text and deserialize ourselves.
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new BookingsApiException((int)res.StatusCode, BookingsApiException.ExtractDetail(body) ?? res.ReasonPhrase ?? "Bookings request failed");

        if (string.IsNullOrWhiteSpace(body)) return [];

        try
        {
            using var doc = JsonDocument.Parse(body);
            var items = FindList(doc.RootElement);
            if (items is { } list) return list.Deserialize<List<BookingDto>>(Json) ?? [];

            // A single booking object returned on its own.
            if (doc.RootElement.ValueKind == JsonValueKind.Object)
                return [doc.RootElement.Deserialize<BookingDto>(Json)!];

            if (doc.RootElement.ValueKind == JsonValueKind.Null) return [];
        }
        catch (JsonException ex)
        {
            LogUnreadable(body, ex);
            throw new BookingsApiException((int)HttpStatusCode.BadGateway, "The bookings service returned an unreadable response.", ex);
        }

        LogUnreadable(body, null);
        throw new BookingsApiException((int)HttpStatusCode.BadGateway, "The bookings service returned an unexpected response shape.");
    }

    /// <summary>Returns the array element: the root itself, a known envelope property, or the only array property.</summary>
    private static JsonElement? FindList(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Array) return root;
        if (root.ValueKind != JsonValueKind.Object) return null;

        foreach (var key in EnvelopeKeys)
            foreach (var prop in root.EnumerateObject())
                if (prop.Value.ValueKind == JsonValueKind.Array &&
                    string.Equals(prop.Name, key, StringComparison.OrdinalIgnoreCase))
                    return prop.Value;

        var arrays = root.EnumerateObject().Where(p => p.Value.ValueKind == JsonValueKind.Array).ToList();
        return arrays.Count == 1 ? arrays[0].Value : null;
    }

    private void LogUnreadable(string body, Exception? ex)
    {
        var snippet = body.Length <= 500 ? body : body[..500] + "...";
        log.LogWarning(ex, "Bookings response could not be mapped to BookingDto[]. Body starts with: {Snippet}", snippet);
    }
}