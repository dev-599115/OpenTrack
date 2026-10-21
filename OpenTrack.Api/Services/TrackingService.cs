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
    Task<IReadOnlyList<StatusCount>> GetStatusCountsAsync(CancellationToken ct);
    Task<SyncResult> SyncAsync(CancellationToken ct);
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

    public async Task<MasterBillDto> TrackMasterBillAsync(TrackMasterBillRequest r, CancellationToken ct)
    {
        var mbl = Ids.MasterBill(r.Number);
        var dto = await client.TrackMasterBillAsync(mbl, r.ScacCode?.Trim().ToUpperInvariant(), r.ReferenceNumbers, ct);
        await IndexMasterBillAsync(dto, mbl, ct); // previously skipped: containers returned on import never reached the dashboard
        return dto;
    }

    public async Task<MasterBillDto> GetMasterBillAsync(string number, CancellationToken ct)
    {
        var mbl = Ids.MasterBill(number);
        var dto = await client.GetMasterBillAsync(mbl, ct);
        await IndexMasterBillAsync(dto, mbl, ct);
        return dto;
    }

    private async Task IndexMasterBillAsync(MasterBillDto dto, string mbl, CancellationToken ct)
    {
        if (dto.Containers is not { Count: > 0 } list) return;
        foreach (var c in await UpsertAsync(list, mbl, dto.ScacCode, ct)) Cache(c);
    }

    public async Task<IReadOnlyList<StatusCount>> GetStatusCountsAsync(CancellationToken ct) =>
        await db.TrackedContainers.AsNoTracking()
            .GroupBy(x => x.Status)
            .OrderByDescending(g => g.Count())
            .Select(g => new StatusCount(g.Key, g.Count()))
            .ToListAsync(ct);

    // ---- sync: keeps the local index (what the dashboard lists) aligned with OpenTrack without needing webhooks ----------

    private static readonly string[] TerminalStatuses = ["DELIVERED", "EMPTY_RETURNED", "NOT_FOUND"];
    private static readonly TimeSpan MinSyncInterval = TimeSpan.FromSeconds(45);
    private const int MaxUpstreamCallsPerSync = 25;
    private const int SyncParallelism = 4;
    private static readonly SemaphoreSlim SyncGate = new(1, 1);
    private static long _lastSyncTicks;

    /// <summary>
    /// Refreshes every still-active container, and re-reads each distinct master bill so sibling containers that were
    /// never opened in the UI get discovered and indexed. Throttled process-wide so many browser tabs can't hammer OpenTrack.
    /// </summary>
    public async Task<SyncResult> SyncAsync(CancellationToken ct)
    {
        if (!await SyncGate.WaitAsync(0, ct)) return SyncResult.Skipped();
        try
        {
            var now = DateTimeOffset.UtcNow;
            var last = new DateTimeOffset(Interlocked.Read(ref _lastSyncTicks), TimeSpan.Zero);
            if (now - last < MinSyncInterval) return SyncResult.Skipped();
            Interlocked.Exchange(ref _lastSyncTicks, now.UtcTicks);

            var active = await db.TrackedContainers.AsNoTracking()
                .Where(x => x.CompletionReason == null && !TerminalStatuses.Contains(x.Status))
                .OrderBy(x => x.UpdatedAt) // stalest first, so a capped run still rotates through everything
                .Select(x => new { x.ContainerId, x.MasterBillNumber })
                .ToListAsync(ct);

            // One master-bill call covers all its containers, so those go first; containers without a bill are fetched individually.
            var jobs = active.Where(x => x.MasterBillNumber != null).Select(x => (Mbl: true, Key: x.MasterBillNumber!)).Distinct()
                .Concat(active.Where(x => x.MasterBillNumber == null).Select(x => (Mbl: false, Key: x.ContainerId)))
                .Take(MaxUpstreamCallsPerSync)
                .ToList();

            var fetched = new System.Collections.Concurrent.ConcurrentBag<(List<ContainerDto> Items, string? Mbl, string? Scac)>();
            var failed = 0;
            var rateLimited = 0;

            await Parallel.ForEachAsync(jobs, new ParallelOptions { MaxDegreeOfParallelism = SyncParallelism, CancellationToken = ct },
                async (job, token) =>
                {
                    if (Volatile.Read(ref rateLimited) == 1) return;
                    try
                    {
                        if (job.Mbl)
                        {
                            var mb = await client.GetMasterBillAsync(job.Key, token);
                            if (mb.Containers is { Count: > 0 } list) fetched.Add((list, job.Key, mb.ScacCode));
                        }
                        else
                        {
                            var c = await client.GetContainerAsync(job.Key, token);
                            if (string.IsNullOrWhiteSpace(c.ContainerId)) c.ContainerId = job.Key;
                            fetched.Add((new List<ContainerDto> { c }, null, null));
                        }
                    }
                    catch (OpenTrackApiException ex) when (ex.StatusCode == 429)
                    {
                        Interlocked.Exchange(ref rateLimited, 1);
                        log.LogWarning("Sync stopped early: OpenTrack rate limit reached");
                    }
                    catch (Exception ex) when ((ex is OpenTrackApiException or HttpRequestException or TaskCanceledException) && !ct.IsCancellationRequested)
                    {
                        Interlocked.Increment(ref failed);
                        log.LogWarning(ex, "Sync failed for {Key}", job.Key);
                    }
                });

            // DbContext isn't thread-safe: fetch in parallel above, write sequentially here.
            var before = await db.TrackedContainers.CountAsync(ct);
            var applied = 0;
            foreach (var (items, mbl, scac) in fetched)
                foreach (var c in await UpsertAsync(items, mbl, scac, ct)) { Cache(c); applied++; }
            var added = Math.Max(0, await db.TrackedContainers.CountAsync(ct) - before);

            log.LogInformation("Sync checked {Checked} upstream resources: {Added} added, {Updated} updated, {Failed} failed", jobs.Count, added, applied - added, failed);
            return new(jobs.Count, failed, added, Math.Max(0, applied - added), false, rateLimited == 1, DateTimeOffset.UtcNow);
        }
        finally { SyncGate.Release(); }
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
        // A blank id would collide on the unique index and, because everything is saved in ONE SaveChanges, take the
        // whole batch down with it (silently - that is how "only some" containers of a master bill ended up indexed).
        var batch = containers
            .Where(c => !string.IsNullOrWhiteSpace(c.ContainerId))
            .GroupBy(c => c.ContainerId.Trim().ToUpperInvariant())
            .Select(g => (Id: g.Key, Dto: g.OrderByDescending(c => c.Timestamp ?? DateTimeOffset.MinValue).First()))
            .ToList();

        if (batch.Count < containers.Count)
            log.LogWarning("Upsert dropped {Count} container snapshot(s) with a blank or duplicate containerId", containers.Count - batch.Count);
        if (batch.Count == 0) return [];

        var ids = batch.Select(b => b.Id).ToList();

        for (var attempt = 1; ; attempt++)
        {
            var existing = await db.TrackedContainers.Where(x => ids.Contains(x.ContainerId)).ToDictionaryAsync(x => x.ContainerId, ct);
            var applied = new List<ContainerDto>();

            foreach (var (id, c) in batch)
            {
                if (!existing.TryGetValue(id, out var entity))
                {
                    entity = new TrackedContainer { ContainerId = id };
                    db.TrackedContainers.Add(entity);
                }
                if (entity.Apply(c, fallbackMbl, fallbackScac)) applied.Add(c);
            }

            try
            {
                await db.SaveChangesAsync(ct);
                return applied; // only what was actually persisted - callers cache this
            }
            catch (DbUpdateException ex)
            {
                // Typically a concurrent request inserted the same container (unique index). Drop our stale tracking state and
                // retry once: the winner's row now exists, so this pass updates it instead of inserting.
                db.ChangeTracker.Clear();
                if (attempt >= 2)
                {
                    log.LogError(ex, "Upsert failed twice for {Ids}; rows were not indexed", string.Join(',', ids));
                    return [];
                }
                log.LogWarning(ex, "Concurrent upsert for {Ids}; retrying", string.Join(',', ids));
            }
        }
    }

    private void Cache(ContainerDto dto)
    {
        var ttl = options.Value.ContainerCacheSeconds;
        if (ttl > 0) cache.Set(Key(dto.ContainerId.ToUpperInvariant()), dto, TimeSpan.FromSeconds(ttl));
    }
}