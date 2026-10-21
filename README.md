# OpenTrack container tracker

ASP.NET Core 8 Web API (proxy + local index + webhook receiver) with a React 19 / Tailwind 4 frontend.

```
OpenTrack.Api/     .NET 8 API
opentrack-web/     Vite + React + TypeScript + Tailwind
```

## 1. Backend

```bash
cd OpenTrack.Api
dotnet user-secrets set "OpenTrack:ApiKey" "<your OpenTrack API key>"
dotnet user-secrets set "OpenTrack:WebhookSecret" "<long random string>"
dotnet run --urls http://localhost:5080        # Swagger: http://localhost:5080/swagger
```

NuGet (already in the csproj): Microsoft.AspNetCore.Authentication.JwtBearer, Microsoft.EntityFrameworkCore.Sqlite,
Microsoft.EntityFrameworkCore.Design, Microsoft.Extensions.Http.Resilience, Swashbuckle.AspNetCore.

Config keys (`appsettings.json` / env vars, e.g. `OpenTrack__ApiKey`):

| Key | Purpose |
|---|---|
| `OpenTrack:ApiKey` | Sent as `Opentrack-API-Key`. Startup fails if empty. |
| `OpenTrack:WebhookSecret` | HMAC secret for `X-OpenTrack-Signature`. Webhook receiver returns 503 until set. |
| `OpenTrack:ContainerCacheSeconds` | In-memory cache for `GET /api/containers/{id}` (0 disables). |
| `Cors:Origins` | Allowed browser origins (only needed if the SPA is hosted separately). |
| `Auth:Enabled/Authority/Audience` | Turns on JWT bearer for every endpoint except the webhook receiver and `/healthz`. `Admin` role guards webhook management. |

### Bookings service (optional)

The Bookings page reads `GET api/OpenTrack` on your internal bookings service through this API (`GET /api/bookings`).
Without `Bookings:BaseUrl` the endpoint answers 503 and the rest of the app is unaffected.

Set `Bookings:BaseUrl` in `appsettings.json` (or the `Bookings__BaseUrl` environment variable in production):

```json
"Bookings": { "BaseUrl": "https://<bookings-host>/" }
```

`UserCountry` is required by the service and is currently supplied by the browser. When `Auth:Enabled=true`, derive it from the
caller's claims in `BookingsController` instead of trusting the query string.

## 2. Frontend

```bash
cd opentrack-web
npm install
npm run dev          # http://localhost:5173, /api proxied to :5080
npm run build        # emits into ../../OpenTrack-Web (the IIS site folder)
```

`npm run build -- --outDir ../OpenTrack.Api/wwwroot` emits into the API's `wwwroot` instead, for a single-host deployment.

## 3. Webhooks

1. Expose the API over public HTTPS (prod domain, or a dev tunnel / ngrok locally).
2. Register: `POST /api/webhooks` `{ "url": "https://<host>/api/webhooks/opentrack", "name": "tracker", "events": ["container.status.updated", "container.location.updated"] }`.
   Omit `events` for all types. The secret is taken from `OpenTrack:WebhookSecret`.
3. After downtime, replay with `GET /api/webhooks/events?timestamp=<unix>`.

## 4. Production checklist

- Replace `EnsureCreated()` + SQLite with EF migrations on SQL Server/Postgres (`dotnet ef migrations add Init`) and drop the `DateTimeOffsetToBinaryConverter` convention.
- IIS: install the .NET 8 Hosting Bundle, publish with `dotnet publish -c Release`, set `OpenTrack__ApiKey` / `OpenTrack__WebhookSecret` as environment variables on the site/app pool, enable HTTPS.
- Move the real `OpenTrack:ApiKey` / `OpenTrack:WebhookSecret` out of `appsettings.json` (that file is committed) and rotate the key that is in git history.
- Set `Auth:Enabled=true` with your IdP, and send the access token from the SPA (`localStorage['access_token']` is read by `src/lib/api.ts`).

### 4.1 Two hosts: web on `opentrack.vlogicx.com`, API on `ot-api.vlogicx.com`

The SPA is a client-side router, so the two hosts must be configured as follows.

**Web host (static files on IIS)**

1. `npm ci && npm run build` inside `opentrack-web` - this writes `index.html` + `assets/` into `D:\OpenTrack-Application\OpenTrack-Web`.
2. Copy the contents of that folder to the physical path of the `opentrack.vlogicx.com` IIS site.
3. The build copies `opentrack-web/deploy/web.config` next to `index.html` automatically. It rewrites client-side routes
   (`/bookings`, `/webhooks`, `/containers/{id}`) to `index.html`; without it those URLs return 404 on refresh.
   Requires the IIS URL Rewrite module.

**API host**

4. `dotnet publish -c Release -o D:\OpenTrack-Application\OpenTrack-Api` and copy that folder to the site root.
   The schema is created on startup, so the tracked-container table exists in Production.
5. Point the database at a writable path and grant the app pool identity write access to it, e.g. environment variable
   `ConnectionStrings__Default=Data Source=D:\OpenTrack\Data\opentrack.db`. The default `Data Source=opentrack.db` is relative
   to the app folder and fails with `SQLite Error 14: 'unable to open database file'` when the folder is missing or not writable -
   SQLite does not create the folder itself. The startup log states the resolved path and the exact error.
6. `Cors:Origins` must contain the web origin (`https://opentrack.vlogicx.com` is already listed).

**Build-time API origin**

`opentrack-web/.env.production` sets `VITE_API_BASE=https://ot-api.vlogicx.com`, so the bundle calls the API cross-origin.
Change that file when the API host changes. If you instead reverse-proxy the web host to the API host (IIS ARR), leave
`VITE_API_BASE` empty so every call stays same-origin and CORS drops out of the picture.

### 4.2 Single host

`npm run build -- --outDir ../OpenTrack.Api/wwwroot` emits into the API's `wwwroot` and the API serves it
(`UseStaticFiles` + `MapFallbackToFile`), so one site can host both. Publish the API *after* the web build - `wwwroot/` is
git-ignored, so a publish from a clean clone ships no SPA.

