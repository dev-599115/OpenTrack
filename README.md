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

## 2. Frontend

```bash
cd opentrack-web
npm install
npm run dev          # http://localhost:5173, /api proxied to :5080
npm run build        # emits into ../OpenTrack.Api/wwwroot (served by the API)
```

## 3. Webhooks

1. Expose the API over public HTTPS (prod domain, or a dev tunnel / ngrok locally).
2. Register: `POST /api/webhooks` `{ "url": "https://<host>/api/webhooks/opentrack", "name": "tracker", "events": ["container.status.updated", "container.location.updated"] }`.
   Omit `events` for all types. The secret is taken from `OpenTrack:WebhookSecret`.
3. After downtime, replay with `GET /api/webhooks/events?timestamp=<unix>`.

## 4. Production checklist

- Replace `EnsureCreated()` + SQLite with EF migrations on SQL Server/Postgres (`dotnet ef migrations add Init`) and drop the `DateTimeOffsetToBinaryConverter` convention.
- IIS: install the .NET 8 Hosting Bundle, publish with `dotnet publish -c Release`, set `OpenTrack__ApiKey` / `OpenTrack__WebhookSecret` as environment variables on the site/app pool, enable HTTPS.
- Set `Auth:Enabled=true` with your IdP, and send the access token from the SPA (`localStorage['access_token']` is read by `src/lib/api.ts`).
