using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using OpenTrack.Api.Data;
using OpenTrack.Api.Models;
using OpenTrack.Api.Options;

namespace OpenTrack.Api.Services;

public interface ITrackingService
{
    Task<PagedResult<ContainerSummary>> ListAsync(ContainerListQuery query, CancellationToken ct);
    Task<ContainerDto> TrackAsync(TrackContainerRequest request, CancellationToken ct);
    Task<ContainerDto> GetAsync(string containerId, bool refresh, CancellationToken ct);
    Task<JsonElement> GetRouteAsync(string containerId, CancellationToken ct);
    Task<bool> RemoveAsync(string containerId, CancellationToken ct);
    Task<MasterBillDto> TrackMasterBillAsync(TrackMasterBillRequest request, CancellationToken ct);
    Task<MasterBillDto> GetMasterBillAsync(string number, CancellationToken ct);
    Task ApplyWebhookAsync(string eventName, JsonElement data, CancellationToken ct);
}

public sealed class TrackingService(
    AppDbContext db,
    IOpenTrackClient client,
    IMemoryCache cache,
    IOptions<OpenTrackOptions> options,
    ILogger<TrackingService> log) : ITrackingService
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    private static string Key(string id) => $"container:{id}";

    public async Task<PagedResult<ContainerSummary>> ListAsync(ContainerListQuery q, CancellationToken ct)
    {
        var query = db.TrackedContainers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(q.Search))
        {
            var s = q.Search.Trim().ToUpperInvariant();
            query = query.Where(x => x.ContainerId.Contains(s) || (x.MasterBillNumber != null && x.MasterBillNumber.Contains(s)));
        }
        if (!string.IsNullOrWhiteSpace(q.Status))
            query = query.Where(x => x.Status == q.Status);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(x => x.UpdatedAt)
            .Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)
            .Select(x => new ContainerSummary(x.ContainerId, x.ScacCode, x.MasterBillNumber, x.Status, x.EtaAtTerminal,
                x.LastFreeDay, x.DemurrageOwed, x.Destination, x.CreatedAt, x.UpdatedAt))
            .ToListAsync(ct);

        return new(items, total, q.Page, q.PageSize);
    }

    public async Task<ContainerDto> TrackAsync(TrackContainerRequest r, CancellationToken ct)
    {
        var id = Ids.Container(r.ContainerId);
        var scac = r.ScacCode.Trim().ToUpperInvariant();
        var mbl = Ids.MasterBill(r.MasterBillNumber);

        var dto = await client.TrackContainerAsync(id, scac, mbl, r.ReferenceNumbers, ct);
        if (string.IsNullOrWhiteSpace(dto.ContainerId)) dto.ContainerId = id;

        await UpsertAsync([dto], mbl, scac, ct);
        Cache(dto);
        return dto;
    }

    public async Task<ContainerDto> GetAsync(string containerId, bool refresh, CancellationToken ct)
    {
        var id = Ids.Container(containerId);
        if (!refresh && cache.TryGetValue(Key(id), out ContainerDto? hit) && hit is not null) return hit;

        var dto = await client.GetContainerAsync(id, ct);
        if (string.IsNullOrWhiteSpace(dto.ContainerId)) dto.ContainerId = id;

        await UpsertAsync([dto], null, null, ct);
        Cache(dto);
        return dto;
    }

    public Task<JsonElement> GetRouteAsync(string containerId, CancellationToken ct) =>
        client.GetRouteAsync(Ids.Container(containerId), ct);

    /// <summary>Removes the container from the local dashboard only (no upstream "stop tracking" endpoint is documented).</summary>
    public async Task<bool> RemoveAsync(string containerId, CancellationToken ct)
    {
        var id = Ids.Container(containerId);
        var removed = await db.TrackedContainers.Where(x => x.ContainerId == id).ExecuteDeleteAsync(ct);
        cache.Remove(Key(id));
        return removed > 0;
    }

    public Task<MasterBillDto> TrackMasterBillAsync(TrackMasterBillRequest r, CancellationToken ct) =>
        client.TrackMasterBillAsync(Ids.MasterBill(r.Number), r.ScacCode?.Trim().ToUpperInvariant(), r.ReferenceNumbers, ct);

    public async Task<MasterBillDto> GetMasterBillAsync(string number, CancellationToken ct)
    {
        var mbl = Ids.MasterBill(number);
        var dto = await client.GetMasterBillAsync(mbl, ct);
        if (dto.Containers is { Count: > 0 } list)
        {
            var applied = await UpsertAsync(list, mbl, dto.ScacCode, ct);
            foreach (var c in applied) Cache(c);
        }
        return dto;
    }

    public async Task ApplyWebhookAsync(string eventName, JsonElement data, CancellationToken ct)
    {
        if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("containerId", out _)) return;

        var dto = data.Deserialize<ContainerDto>(WebJson);
        if (dto is null || string.IsNullOrWhiteSpace(dto.ContainerId)) return;

        var applied = await UpsertAsync([dto], null, null, ct);
        foreach (var c in applied) Cache(c);
        log.LogInformation("Webhook {Event} applied to {ContainerId} (status {Status})", eventName, dto.ContainerId, dto.Status);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------

    private async Task<List<ContainerDto>> UpsertAsync(IReadOnlyList<ContainerDto> containers, string? fallbackMbl,
        string? fallbackScac, CancellationToken ct)
    {
        var ids = containers.Select(c => c.ContainerId.ToUpperInvariant()).ToList();
        var existing = await db.TrackedContainers.Where(x => ids.Contains(x.ContainerId)).ToDictionaryAsync(x => x.ContainerId, ct);
        var applied = new List<ContainerDto>();

        foreach (var c in containers)
        {
            var id = c.ContainerId.ToUpperInvariant();
            if (!existing.TryGetValue(id, out var entity))
            {
                entity = new TrackedContainer { ContainerId = id };
                db.TrackedContainers.Add(entity);
                existing[id] = entity;
            }
            if (entity.Apply(c, fallbackMbl, fallbackScac)) applied.Add(c);
        }

        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex)
        {
            // Two concurrent requests inserted the same container (unique index). The other write wins; ours is a no-op.
            log.LogWarning(ex, "Concurrent upsert for {Ids}", string.Join(',', ids));
        }
        return applied;
    }

    private void Cache(ContainerDto dto)
    {
        var ttl = options.Value.ContainerCacheSeconds;
        if (ttl > 0) cache.Set(Key(dto.ContainerId.ToUpperInvariant()), dto, TimeSpan.FromSeconds(ttl));
    }
}