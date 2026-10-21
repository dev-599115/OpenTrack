namespace OpenTrack.Api.Options;

/// <summary>
/// The internal bookings/containers service (GET api/OpenTrack). Optional: when BaseUrl is empty the endpoint answers 503
/// instead of failing startup, so the tracker keeps working without it.
/// </summary>
public sealed class BookingsOptions
{
    public const string Section = "Bookings";

    /// <summary>Base address of the bookings service, e.g. https://bookings.example.com/ (appsettings.json, or env var Bookings__BaseUrl).</summary>
    public string? BaseUrl { get; set; }
}
