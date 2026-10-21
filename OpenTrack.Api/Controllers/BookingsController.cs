using Microsoft.AspNetCore.Mvc;
using OpenTrack.Api.Models;
using OpenTrack.Api.Services;

namespace OpenTrack.Api.Controllers;

[ApiController]
[Route("api/bookings")]
[Produces("application/json")]
public sealed class BookingsController(IBookingsClient bookings) : ControllerBase
{
    /// <summary>Bookings and their containers from the bookings service (proxied so the browser never sees its URL or credentials).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BookingDto>>> List([FromQuery] BookingQuery query, CancellationToken ct) =>
        Ok(await bookings.ListAsync(query, ct));
}
