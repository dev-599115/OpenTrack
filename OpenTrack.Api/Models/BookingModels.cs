using System.ComponentModel.DataAnnotations;

namespace OpenTrack.Api.Models;

/// <summary>One booking / container row from the bookings service.</summary>
public sealed record BookingDto(
    string? PartyName,
    string? MasterBillNumber,
    string? ContainerId,
    string? CarrierName,
    string? ContainerSize,
    string? Consignee,
    string? JobNumber,
    string? Supplier,
    string? PoNumber,
    string? HouseBillOfLadingNumber,
    string? Program,
    string? DistributionCenter,
    string? DestinationAddress,
    string? DestinationContainerFreightStation,
    string? OriginContainerFreightStation,
    string? Customer);

public sealed class BookingQuery
{
    /// <summary>Required by the upstream API.</summary>
    [Required(AllowEmptyStrings = false), StringLength(60)]
    public string UserCountry { get; set; } = "";

    public DateTimeOffset? Cutoff { get; set; }

    [StringLength(60)] public string? JobNo { get; set; }
    [StringLength(100)] public string? Search { get; set; }
    [StringLength(11)] public string? ContainerNo { get; set; }
}
