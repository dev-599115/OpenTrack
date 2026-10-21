using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenTrack.Api.Models;

/// <summary>
/// Typed view of the fields we use. Everything else OpenTrack sends (customFields, trucking, deprecated fields...)
/// is kept in <see cref="Extra"/> and passed through to the client untouched.
/// </summary>
public abstract class ExtensibleDto
{
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }
}

public sealed class AccountDto : ExtensibleDto
{
    public string Domain { get; set; } = "";
    public string? Region { get; set; }
}

public sealed class OperatorDto : ExtensibleDto
{
    public string? Name { get; set; }
    public string? ScacCode { get; set; }
}

public sealed class VesselDto : ExtensibleDto
{
    public string Name { get; set; } = "";
    public string? Imo { get; set; }
    public string? Mmsi { get; set; }
    public string? CountryCode { get; set; }
    public OperatorDto? Operator { get; set; }
}

public sealed class CoordinatesDto : ExtensibleDto
{
    public double Latitude { get; set; }
    public double Longitude { get; set; }
}

public sealed class LocationDto : ExtensibleDto
{
    public string Name { get; set; } = "";
    public string? Type { get; set; }
    public string? Unlocode { get; set; }
    public string? Timezone { get; set; }
    public CoordinatesDto? Coordinates { get; set; }
}

public sealed class PositionDto : ExtensibleDto
{
    public CoordinatesDto? Coordinates { get; set; }
}

public sealed class TerminalDto : ExtensibleDto
{
    public string Name { get; set; } = "";
    public string? Address { get; set; }
    public string? FirmsCode { get; set; }
}

public sealed class HoldDto : ExtensibleDto
{
    public string Type { get; set; } = "";
    public string? Code { get; set; }
    public string? Remarks { get; set; }
    public decimal? AmountDue { get; set; }
    public DateTimeOffset? ReportedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
}

public sealed class MilestoneDto : ExtensibleDto
{
    public string Milestone { get; set; } = "";
    public LocationDto? Location { get; set; }
    public DateTimeOffset? Timestamp { get; set; }
    public VesselDto? Vessel { get; set; }
}

public sealed class RailCarrierDto : ExtensibleDto
{
    public string? Name { get; set; }
    public string? ScacCode { get; set; }
}

public sealed class RailStationDto : ExtensibleDto
{
    public string? Name { get; set; }
    public string? Fsac { get; set; }
    public string? Unlocode { get; set; }
    public string? FirmsCode { get; set; }
}

public sealed class ContainerDto : ExtensibleDto
{
    public AccountDto? Account { get; set; }
    public DateTimeOffset? Timestamp { get; set; }
    public string ContainerId { get; set; } = "";
    public string? CompletionReason { get; set; }
    public string ScacCode { get; set; } = "";
    public string? MasterBillNumber { get; set; }
    public string? TradeType { get; set; }
    public string? SteamshipLine { get; set; }
    public VesselDto? Vessel { get; set; }
    public VesselDto? CurrentVessel { get; set; }
    public string? VoyageNumber { get; set; }
    public string? ContainerSize { get; set; }
    public string? ContainerType { get; set; }
    public decimal? GrossWeight { get; set; }
    public string Status { get; set; } = "DISCOVERING";

    public DateTimeOffset? CarrierReleasedDate { get; set; }
    public DateTimeOffset? CustomsReleasedDate { get; set; }
    public DateTimeOffset? EtaAtTerminal { get; set; }
    public DateTimeOffset? EtdFromOrigin { get; set; }
    public DateTimeOffset? LastFreeDay { get; set; }
    public DateTimeOffset? LineLastFreeDay { get; set; }
    public DateTimeOffset? DetentionLastFreeDay { get; set; }
    public DateTimeOffset? AppointmentDate { get; set; }

    /// <summary>Currency units (e.g. 250). The *Decimal variant (cents) lands in Extra.</summary>
    public decimal? DemurrageOwedAtPort { get; set; }
    public decimal? DemurrageIncurred { get; set; }

    public LocationDto? OriginPort { get; set; }
    public LocationDto? DestinationPort { get; set; }
    public LocationDto? FinalDestination { get; set; }
    public LocationDto? CurrentLocation { get; set; }
    public PositionDto? LastKnownPosition { get; set; }
    public DateTimeOffset? LastKnownPositionDate { get; set; }
    public TerminalDto? TerminalAtDestinationPort { get; set; }
    public string? YardLocation { get; set; }

    public List<HoldDto>? Holds { get; set; }
    public List<MilestoneDto>? History { get; set; }
    public List<MilestoneDto>? Timeline { get; set; }

    public DateTimeOffset? EtaAtDestination { get; set; }
    public bool? IsRailMove { get; set; }
    public RailCarrierDto? RailCarrier { get; set; }
    public RailStationDto? FinalRailStation { get; set; }
    public DateTimeOffset? LastFreeDayAtRailStation { get; set; }
    public decimal? DemurrageOwedAtRailStation { get; set; }

    public string? TrackingPage { get; set; }
}

public sealed class MasterBillDto : ExtensibleDto
{
    /// <summary>LOCATING | TRACKED | ARCHIVED</summary>
    public string Status { get; set; } = "LOCATING";
    public string Number { get; set; } = "";
    public string? ScacCode { get; set; }

    /// <summary>OpenTrack sends an array here (e.g. []), sometimes an object - the raw value is kept as-is.</summary>
    public JsonElement? ReferenceNumbers { get; set; }

    public List<ContainerDto>? Containers { get; set; }
}
