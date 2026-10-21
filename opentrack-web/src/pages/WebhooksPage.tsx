import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseEvents, useDeleteWebhook, useRegisterWebhook, useReplayEvents, useWebhooks } from '../hooks';
import { ApiError } from '../lib/api';
import { fmtDate } from '../lib/format';

const KNOWN_EVENTS = ['container.status.updated', 'container.location.updated'];
const field = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm';

const isForbidden = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);

/** `datetime-local` value (local time, no zone) for "n hours ago". */
const localInput = (hoursAgo: number) => {
  const d = new Date(Date.now() - hoursAgo * 3_600_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function WebhooksPage() {
  const hooks = useWebhooks();
  const register = useRegisterWebhook();
  const remove = useDeleteWebhook();
  const replay = useReplayEvents();

  const [url, setUrl] = useState('');
  const [name, setName] = useState('tracker');
  const [events, setEvents] = useState<string[]>([]);

  const [since, setSince] = useState(() => localInput(24));
  const [replayContainer, setReplayContainer] = useState('');

  const replayed = useMemo(() => (replay.data ? parseEvents(replay.data) : []), [replay.data]);

  function submitRegister(e: FormEvent) {
    e.preventDefault();
    register.mutate(
      { url: url.trim(), name: name.trim() || undefined, events: events.length ? events : undefined },
      { onSuccess: () => { setUrl(''); setEvents([]); } },
    );
  }

  function submitReplay(e: FormEvent) {
    e.preventDefault();
    const ts = Math.floor(new Date(since).getTime() / 1000);
    if (!Number.isFinite(ts)) return;
    replay.mutate({ timestamp: ts, containerId: replayContainer.trim().toUpperCase() || undefined, perPage: 25 });
  }

  if (isForbidden(hooks.error)) {
    return (
      <div role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">Admin access required</p>
        <p className="text-sm">Webhook management is limited to the Admin role. Sign in with an admin account and try again.</p>
        <Link to="/" className="mt-2 inline-block text-sm underline">Back to containers</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-1 text-sm text-slate-600">
          OpenTrack pushes status and location changes to your API so the dashboard stays current between syncs.
          The signing secret is read from the server’s <code>OpenTrack:WebhookSecret</code> and never shown here.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 p-4 text-base font-semibold">Registered webhooks</h2>
        {hooks.isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
        {hooks.error && <p role="alert" className="p-4 text-sm text-rose-700">Couldn’t load webhooks: {hooks.error.message}</p>}
        {hooks.data && (
          <ul className="divide-y divide-slate-100">
            {hooks.data.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{w.name ?? w.id}</p>
                  <p className="truncate text-slate-600">{w.url ?? '—'}</p>
                  <p className="text-xs text-slate-500">
                    {w.events?.length ? w.events.join(', ') : 'All events'}{w.createdAt ? ` · created ${fmtDate(w.createdAt)}` : ''}
                  </p>
                </div>
                <button
                  disabled={remove.isPending}
                  onClick={() => confirm(`Delete webhook “${w.name ?? w.id}”? OpenTrack will stop sending events to it.`) && remove.mutate(w.id)}
                  className="rounded-md border border-rose-300 bg-white px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                  Delete
                </button>
              </li>
            ))}
            {!hooks.data.length && <li className="px-4 py-8 text-center text-sm text-slate-500">No webhooks registered yet.</li>}
          </ul>
        )}
        {remove.error && <p role="alert" className="border-t border-slate-100 p-4 text-sm text-rose-700">{remove.error.message}</p>}
      </section>

      <form onSubmit={submitRegister} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Register a webhook</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium md:col-span-2">Public HTTPS URL
            <input className={field} type="url" required pattern="https://.+" placeholder="https://your-host/api/webhooks/opentrack"
              value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="text-sm font-medium">Name
            <input className={field} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">Events <span className="font-normal text-slate-500">(none selected = all events)</span></legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {KNOWN_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={events.includes(ev)}
                  onChange={(e) => setEvents((cur) => (e.target.checked ? [...cur, ev] : cur.filter((x) => x !== ev)))} />
                {ev}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={register.isPending}
          className="mt-4 rounded-md bg-harbor px-4 py-2 text-sm font-semibold text-white hover:bg-harbor-dark disabled:opacity-60">
          {register.isPending ? 'Registering…' : 'Register webhook'}
        </button>
        {register.error && <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{register.error.message}</p>}
        {register.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">Webhook registered.</p>}
      </form>

      <form onSubmit={submitReplay} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Replay missed events</h2>
        <p className="mb-3 mt-1 text-sm text-slate-600">After downtime, fetch what OpenTrack sent since a point in time (up to 25 per request).</p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium md:col-span-2">Since
            <input className={field} type="datetime-local" required value={since} onChange={(e) => setSince(e.target.value)} />
          </label>
          <label className="text-sm font-medium">Container (optional)
            <input className={`${field} uppercase`} maxLength={11} placeholder="MRKU2642087" value={replayContainer}
              onChange={(e) => setReplayContainer(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={replay.isPending}
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
              {replay.isPending ? 'Fetching…' : 'Fetch events'}
            </button>
          </div>
        </div>
        {replay.error && (
          <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {isForbidden(replay.error) ? 'Admin access required.' : replay.error.message}
          </p>
        )}
        {replay.isSuccess && (
          <ul className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
            {replayed.map((ev, i) => (
              <li key={ev.id ?? i} className="px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{ev.event}</span>
                  <span className="text-slate-600">
                    {ev.containerId ? <Link className="text-harbor hover:underline" to={`/containers/${ev.containerId}`}>{ev.containerId}</Link> : '—'}
                    {' · '}{fmtDate(ev.timestamp)}
                  </span>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-slate-500">Raw payload</summary>
                  <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(ev.raw, null, 2)}</pre>
                </details>
              </li>
            ))}
            {!replayed.length && <li className="px-3 py-6 text-center text-slate-500">No events in that window.</li>}
          </ul>
        )}
      </form>
    </div>
  );
}
