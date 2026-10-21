using System.Text.RegularExpressions;

namespace OpenTrack.Api.Services;

/// <summary>Input normalisation/validation for identifiers that end up in upstream URL paths.</summary>
internal static partial class Ids
{
    [GeneratedRegex(@"^[A-Z]{4}\d{7}$")] private static partial Regex ContainerRx();
    [GeneratedRegex(@"^[A-Z0-9\-]{6,40}$")] private static partial Regex MblRx();

    public static string Container(string? value)
    {
        var n = (value ?? "").Trim().ToUpperInvariant();
        return ContainerRx().IsMatch(n) ? n : throw new ArgumentException("Container ID must be 4 letters followed by 7 digits.");
    }

    public static string MasterBill(string? value)
    {
        var n = (value ?? "").Trim().ToUpperInvariant();
        return MblRx().IsMatch(n) ? n : throw new ArgumentException("Master bill / booking number must be 6-40 letters, digits or dashes.");
    }
}