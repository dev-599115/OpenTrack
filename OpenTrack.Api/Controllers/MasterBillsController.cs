using Microsoft.AspNetCore.Mvc;
using OpenTrack.Api.Models;
using OpenTrack.Api.Services;

namespace OpenTrack.Api.Controllers;

[ApiController]
[Route("api/master-bills")]
[Produces("application/json")]
public sealed class MasterBillsController(ITrackingService tracking) : ControllerBase
{
    /// <summary>Import a master bill or booking number; OpenTrack then discovers its containers.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(MasterBillDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<MasterBillDto>> Track([FromBody] TrackMasterBillRequest request, CancellationToken ct)
    {
        var mb = await tracking.TrackMasterBillAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { number = mb.Number }, mb);
    }

    /// <summary>Status of the master bill and all its containers (also indexes them locally).</summary>
    [HttpGet("{number}")]
    public async Task<ActionResult<MasterBillDto>> Get(string number, CancellationToken ct) =>
        Ok(await tracking.GetMasterBillAsync(number, ct));
}
