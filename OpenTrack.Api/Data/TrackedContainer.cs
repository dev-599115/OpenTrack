using OpenTrack.Api.Models;

namespace OpenTrack.Api.Data;

/// <summary>Local index of tracked containers so the dashboard can list them (OpenTrack has no list endpoint).</summary>
public sealed class TrackedContainer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ContainerId { get; set; } = "";
    public string ScacCode { get; set; } = "";
    public string? MasterBillNumber { get; set; }
    public string Status { get; set; } = "DISCOVERING";
    public string? CompletionReason { get; set; }
    public DateTimeOffset? EtaAtTerminal { get; set; }
    public DateTimeOffset? LastFreeDay { get; set; }
    public decimal? DemurrageOwed { get; set; }
    public string? Destination { get; set; }
    public DateTimeOffset? SourceTimestamp { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Applies an upstream snapshot. Returns false when the snapshot is older than what we already have.</summary>
    public bool Apply(ContainerDto c, string? fallbackMbl, string? fallbackScac)
    {
        if (c.Timestamp is { } incoming && SourceTimestamp is { } current && incoming < current) return false;

        ScacCode = !string.IsNullOrWhiteSpace(c.ScacCode) ? c.ScacCode.ToUpperInvariant() : (fallbackScac ?? ScacCode);
        MasterBillNumber = c.MasterBillNumber ?? fallbackMbl ?? MasterBillNumber;
        Status = c.Status;
        CompletionReason = c.CompletionReason;
        EtaAtTerminal = c.EtaAtTerminal;
        LastFreeDay = c.LastFreeDay;
        DemurrageOwed = c.DemurrageOwedAtPort;
        Destination = c.FinalDestination?.Name ?? c.DestinationPort?.Name ?? Destination;
        SourceTimestamp = c.Timestamp ?? SourceTimestamp;
        UpdatedAt = DateTimeOffset.UtcNow;
        return true;
    }
}
