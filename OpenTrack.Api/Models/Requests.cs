using System.ComponentModel.DataAnnotations;

namespace OpenTrack.Api.Models;

public sealed class TrackContainerRequest
{
    [Required, RegularExpression(@"^[A-Za-z]{4}\d{7}$", ErrorMessage = "Container ID must be 4 letters followed by 7 digits.")]
    public string ContainerId { get; set; } = "";

    [Required, RegularExpression(@"^[A-Za-z]{4}$", ErrorMessage = "SCAC must be 4 letters.")]
    public string ScacCode { get; set; } = "";

    [Required, RegularExpression(@"^[A-Za-z0-9\-]{6,40}$", ErrorMessage = "Master bill number must be 6-40 letters, digits or dashes.")]
    public string MasterBillNumber { get; set; } = "";

    public Dictionary<string, string>? ReferenceNumbers { get; set; }
}

public sealed class TrackMasterBillRequest
{
    [Required, RegularExpression(@"^[A-Za-z0-9\-]{6,40}$", ErrorMessage = "Master bill / booking number must be 6-40 letters, digits or dashes.")]
    public string Number { get; set; } = "";

    /// <summary>Optional when the number is already prefixed with the carrier SCAC.</summary>
    [RegularExpression(@"^[A-Za-z]{4}$", ErrorMessage = "SCAC must be 4 letters.")]
    public string? ScacCode { get; set; }

    public Dictionary<string, string>? ReferenceNumbers { get; set; }
}

public sealed class RegisterWebhookRequest
{
    [Required, RegularExpression(@"^https://.+", ErrorMessage = "Webhook URL must be HTTPS.")]
    public string Url { get; set; } = "";

    [StringLength(100)]
    public string? Name { get; set; }

    /// <summary>Omit or leave empty to receive every event type.</summary>
    public string[]? Events { get; set; }
}

public sealed class ContainerListQuery
{
    [StringLength(60)] public string? Search { get; set; }
    [StringLength(60)] public string? Status { get; set; }
    [Range(1, 10_000)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 25;
}

public sealed record ContainerSummary(
    string ContainerId,
    string ScacCode,
    string? MasterBillNumber,
    string Status,
    DateTimeOffset? EtaAtTerminal,
    DateTimeOffset? LastFreeDay,
    decimal? DemurrageOwed,
    string? Destination,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public sealed record StatusCount(string Status, int Count);

/// <summary>Outcome of an index sync. <see cref="Throttled"/> = another sync ran very recently (or is running); nothing was fetched.</summary>
public sealed record SyncResult(
    int Checked,
    int Failed,
    int Added,
    int Updated,
    bool Throttled,
    bool RateLimited,
    DateTimeOffset At)
{
    public static SyncResult Skipped() => new(0, 0, 0, 0, true, false, DateTimeOffset.UtcNow);
}
