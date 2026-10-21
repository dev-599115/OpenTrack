using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OpenTrack.Api.Data;
using OpenTrack.Api.Infrastructure;
using OpenTrack.Api.Options;
using OpenTrack.Api.Services;
using Polly;
using Polly.Timeout;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---- Options (fail fast at startup if the API key is missing) ---------------------------------------------------
builder.Services.AddOptions<OpenTrackOptions>()
    .Bind(config.GetSection(OpenTrackOptions.Section))
    .ValidateDataAnnotations()
    .ValidateOnStart();

// Bookings is optional (empty BaseUrl => 503 from the endpoint), but a non-empty value must be an absolute http(s) URL.
builder.Services.AddOptions<BookingsOptions>()
    .Bind(config.GetSection(BookingsOptions.Section))
    .Validate(o => string.IsNullOrWhiteSpace(o.BaseUrl) ||
                   (Uri.TryCreate(o.BaseUrl, UriKind.Absolute, out var u) &&
                    (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps)),
              "Bookings:BaseUrl must be an absolute http(s) URL, e.g. https://localhost:7127")
    .ValidateOnStart();

// ---- Persistence + cache ------------------------------------------------------------------------------------------
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(config.GetConnectionString("Default")));
builder.Services.AddMemoryCache();

// ---- OpenTrack typed client with resilience -----------------------------------------------------------------------
builder.Services.AddHttpClient<IOpenTrackClient, OpenTrackClient>((sp, http) =>
    {
        var o = sp.GetRequiredService<IOptions<OpenTrackOptions>>().Value;
        http.BaseAddress = new Uri(o.BaseUrl.TrimEnd('/') + "/");
        http.DefaultRequestHeaders.Add("Opentrack-API-Key", o.ApiKey);
        http.DefaultRequestHeaders.Accept.Add(new("application/json"));
    })
    .AddStandardResilienceHandler(o =>
    {
        // Retry transient failures, but never replay a non-GET response (429 is surfaced to the caller, not retried).
        o.Retry.ShouldHandle = args => ValueTask.FromResult(IsRetryable(args.Outcome));
    });

// ---- Bookings service (optional; GET api/OpenTrack) -----------------------------------------------------------------
var bookingsClientBuilder = builder.Services.AddHttpClient<IBookingsClient, BookingsClient>((sp, http) =>
{
    var o = sp.GetRequiredService<IOptions<BookingsOptions>>().Value;
    if (!string.IsNullOrWhiteSpace(o.BaseUrl) &&
        Uri.TryCreate(o.BaseUrl.Trim(), UriKind.Absolute, out var baseUri))
    {
        http.BaseAddress = new Uri(baseUri.ToString().TrimEnd('/') + "/");
    }
    http.DefaultRequestHeaders.Accept.ParseAdd("application/json, text/plain;q=0.9, */*;q=0.5");
});

// Local development only: accept the self-signed ASP.NET dev certificate of the bookings service (e.g. https://localhost:7127).
// Must be configured on the IHttpClientBuilder, before AddStandardResilienceHandler (which returns a different builder type).
if (builder.Environment.IsDevelopment())
{
    bookingsClientBuilder.ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        ServerCertificateCustomValidationCallback = (_, cert, _, errors) =>
            errors == System.Net.Security.SslPolicyErrors.None ||
            (cert?.Subject.Contains("CN=localhost", StringComparison.OrdinalIgnoreCase) ?? false)
    });
}

bookingsClientBuilder.AddStandardResilienceHandler(); // GET-only client, so the default retry policy is safe here

builder.Services.AddScoped<ITrackingService, TrackingService>();

// ---- AuthN/Z: JWT bearer when Auth:Enabled=true ---------------------------------------------------------------------
var authEnabled = config.GetValue<bool>("Auth:Enabled");
if (authEnabled)
{
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(o =>
        {
            o.Authority = config["Auth:Authority"];
            o.Audience = config["Auth:Audience"];
        });
}
var authz = builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Admin", p =>
    {
        if (authEnabled) p.RequireRole("Admin");
        else p.RequireAssertion(_ => true);
    });
if (authEnabled)
    authz.SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

// ---- CORS, rate limiting, errors, API docs ------------------------------------------------------------------------
var origins = config.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("api", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Startup diagnostics: shows exactly what the running process resolved (helps with env var / user-secrets overrides).
{
    var bookingsUrl = app.Services.GetRequiredService<IOptions<BookingsOptions>>().Value.BaseUrl;
    app.Logger.LogInformation("Environment: {Env}. Bookings:BaseUrl resolved to '{Url}'",
        app.Environment.EnvironmentName,
        string.IsNullOrWhiteSpace(bookingsUrl) ? "<empty - /api/bookings will return 503>" : bookingsUrl);
}

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated(); // use EF migrations in production
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();   // serves the built React app from wwwroot
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/healthz").AllowAnonymous();
app.MapControllers().RequireRateLimiting("api");
app.MapFallbackToFile("index.html").AllowAnonymous(); // SPA client-side routes

app.Run();

static bool IsRetryable(Outcome<HttpResponseMessage> outcome) =>
    outcome.Exception is HttpRequestException or TimeoutRejectedException ||
    (outcome.Result is { } r &&
     r.RequestMessage?.Method == HttpMethod.Get &&
     ((int)r.StatusCode >= 500 || r.StatusCode == HttpStatusCode.RequestTimeout));