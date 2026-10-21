using System.Security.Cryptography;
using System.Text;

namespace OpenTrack.Api.Infrastructure;

public static class WebhookSignature
{
    /// <summary>HMAC-SHA256 (hex) of the raw request body, compared in constant time with X-OpenTrack-Signature.</summary>
    public static bool IsValid(byte[] body, string secret, string? header)
    {
        if (string.IsNullOrWhiteSpace(header)) return false;
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expected = Convert.ToHexString(hmac.ComputeHash(body)).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(header.Trim().ToLowerInvariant()));
    }
}
