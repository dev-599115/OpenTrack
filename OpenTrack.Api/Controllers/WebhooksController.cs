using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using System.Text.Json;
using OpenTrack.Api.Infrastructure;
using OpenTrack.Api.Models;
using OpenTrack.Api.Options;
using OpenTrack.Api.Services;

namespace OpenTrack.Api.Controllers;

[ApiController]
[Route("api/webhooks")]
public sealed class WebhooksController(
    ITrackingService tracking,
    IOpenTrackClient client,
    IOptions<OpenTrackOptions> options,
    ILogger<WebhooksController> log) : ControllerBase
{
    // ---- Receiver (called by OpenTrack, authenticated via HMAC signature instead of JWT) ------------------------

    [HttpPost("opentrack")]
    [AllowAnonymous]
    [DisableRateLimiting]
    [RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> Receive(CancellationToken ct)
    {
        var secret = options.Value.WebhookSecret;
        if (string.IsNullOrWhiteSpace(secret))
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Webhook secret is not configured.");

        using var ms = new MemoryStream();
        await Request.Body.CopyToAsync(ms, ct);
        var body = ms.ToArray();

        if (!WebhookSignature.IsValid(body, secret, Request.Headers["X-OpenTrack-Signature"].ToString()))
        {
            log.LogWarning("Rejected webhook with invalid signature from {Ip}", HttpContext.Connection.RemoteIpAddress);
            return Unauthorized();
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        var evt = root.TryGetProperty("event", out var e) ? e.GetString() : null;

        // container.* events carry the same payload as GET /containers/{id}; others (exceptions, shipment.*) are acknowledged only.
        if (evt is not null && evt.StartsWith("container.", StringComparison.Ordinal) && root.TryGetProperty("data", out var data))
            await tracking.ApplyWebhookAsync(evt, data, ct);

        return Ok(); // 2xx quickly, otherwise OpenTrack retries every 30 min (max 5 attempts)
    }

    // ---- Management (proxy to OpenTrack's webhook registry; restrict to admins in production) -------------------

    [HttpGet]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Content((await client.ListWebhooksAsync(ct)).GetRawText(), "application/json");

    [HttpPost]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> Register([FromBody] RegisterWebhookRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, (await client.RegisterWebhookAsync(request, ct)));

    [HttpDelete("{webhookId}")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> Unregister(string webhookId, CancellationToken ct)
    {
        await client.UnregisterWebhookAsync(webhookId, ct);
        return NoContent();
    }

    /// <summary>Replay webhook events since a Unix timestamp (useful after downtime).</summary>
    [HttpGet("events")]
    [Authorize(Policy = "Admin")]
    public async Task<IActionResult> Events([FromQuery] long timestamp, [FromQuery] string? containerId,
        [FromQuery] int? page, [FromQuery] int? perPage, CancellationToken ct) =>
        Content((await client.GetEventsAsync(timestamp, containerId, page, perPage, ct)).GetRawText(), "application/json");
}
