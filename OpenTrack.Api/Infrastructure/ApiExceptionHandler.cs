using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using OpenTrack.Api.Services;

namespace OpenTrack.Api.Infrastructure;

/// <summary>Maps upstream and validation failures to RFC 7807 problem details without leaking internals.</summary>
public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> log) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        if (ex is OperationCanceledException && ctx.RequestAborted.IsCancellationRequested) return true;

        int status; string title; string? detail = null; string? code = null;

        switch (ex)
        {
            case OpenTrackApiException o:
                code = o.Code;
                (status, title, detail) = o.StatusCode switch
                {
                    400 => (400, "OpenTrack rejected the request", o.Message),
                    404 => (404, "Not found in OpenTrack", o.Message),
                    429 => (429, "OpenTrack rate limit reached", "Try again shortly."),
                    401 or 403 => (502, "OpenTrack authentication failed", "The server's OpenTrack API key was rejected."),
                    _ => (502, "OpenTrack is unavailable", "The tracking provider returned an error.")
                };
                if (o.StatusCode is 401 or 403 or >= 500) log.LogError(ex, "OpenTrack upstream error {Status}", o.StatusCode);
                else log.LogWarning("OpenTrack upstream {Status}: {Message}", o.StatusCode, o.Message);
                if (o.RetryAfterSeconds is { } s) ctx.Response.Headers.RetryAfter = s.ToString();
                break;

            case ArgumentException or JsonException or BadHttpRequestException:
                (status, title, detail) = (400, "Invalid request", ex is ArgumentException ? ex.Message : "Malformed request body.");
                break;

            case HttpRequestException or TaskCanceledException:
                log.LogError(ex, "OpenTrack call failed");
                (status, title, detail) = (504, "OpenTrack did not respond in time", null);
                break;

            default:
                log.LogError(ex, "Unhandled exception");
                (status, title, detail) = (500, "Unexpected server error", null);
                break;
        }

        var problem = new ProblemDetails { Status = status, Title = title, Detail = detail, Instance = ctx.Request.Path };
        if (code is not null) problem.Extensions["code"] = code;

        ctx.Response.StatusCode = status;
        await ctx.Response.WriteAsJsonAsync(problem, options: null, contentType: "application/problem+json", cancellationToken: ct);
        return true;
    }
}
