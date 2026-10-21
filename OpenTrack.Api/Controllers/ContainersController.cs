using Microsoft.AspNetCore.Mvc;
using OpenTrack.Api.Models;
using OpenTrack.Api.Services;

namespace OpenTrack.Api.Controllers;

[ApiController]
[Route("api/containers")]
[Produces("application/json")]
public sealed class ContainersController(ITrackingService tracking) : ControllerBase
{
    /// <summary>Containers tracked through this app (local index), newest activity first.</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<ContainerSummary>>> List([FromQuery] ContainerListQuery query, CancellationToken ct) =>
        Ok(await tracking.ListAsync(query, ct));

    /// <summary>Import a container into OpenTrack tracking.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(ContainerDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<ContainerDto>> Track([FromBody] TrackContainerRequest request, CancellationToken ct)
    {
        var container = await tracking.TrackAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { containerId = container.ContainerId }, container);
    }

    /// <summary>Latest status/milestones. Cached briefly; pass refresh=true to bypass the cache.</summary>
    [HttpGet("{containerId}")]
    public async Task<ActionResult<ContainerDto>> Get(string containerId, [FromQuery] bool refresh = false, CancellationToken ct = default) =>
        Ok(await tracking.GetAsync(containerId, refresh, ct));

    /// <summary>GeoJSON route segments (origin/ocean/destination) for map rendering.</summary>
    [HttpGet("{containerId}/route")]
    public async Task<IActionResult> Route(string containerId, CancellationToken ct) =>
        Content((await tracking.GetRouteAsync(containerId, ct)).GetRawText(), "application/json");

    /// <summary>Remove from the local dashboard (does not stop upstream tracking).</summary>
    [HttpDelete("{containerId}")]
    public async Task<IActionResult> Remove(string containerId, CancellationToken ct) =>
        await tracking.RemoveAsync(containerId, ct) ? NoContent() : NotFound();
}
