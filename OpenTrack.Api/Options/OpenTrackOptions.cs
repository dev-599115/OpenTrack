using System.ComponentModel.DataAnnotations;

namespace OpenTrack.Api.Options;

public sealed class OpenTrackOptions
{
    public const string Section = "OpenTrack";

    [Required, Url]
    public string BaseUrl { get; set; } = "https://api.opentrack.co/";

    /// <summary>Never commit. Use user-secrets locally, environment variables / vault in production.</summary>
    [Required(AllowEmptyStrings = false)]
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>HMAC secret shared with OpenTrack for X-OpenTrack-Signature validation.</summary>
    public string? WebhookSecret { get; set; }

    [Range(0, 3600)]
    public int ContainerCacheSeconds { get; set; } = 30;
}
