import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import TrackForm from '../components/TrackForm';
import { useContainerList, useDebounced, useStatusCounts, useSyncContainers } from '../hooks';
import { daysUntil, fmtDate, fmtMoney, humanize } from '../lib/format';

const AUTO_SYNC_MS = 5 * 60_000;

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const { data, isLoading, isFetching, error } = useContainerList({ search: debounced, status, page, pageSize: 20 });
  const statuses = useStatusCounts();
  const { mutate: runSync, isPending: syncing, data: syncResult, error: syncError } = useSyncContainers();
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // Pull fresh data from OpenTrack on load and every few minutes while the tab is visible. The server throttles this
  // process-wide, so extra tabs (or StrictMode's double effect in dev) don't cause extra upstream calls.
  useEffect(() => {
    const run = () => { if (document.visibilityState === 'visible') runSync(); };
    run();
    const t = setInterval(run, AUTO_SYNC_MS);
    return () => clearInterval(t);
  }, [runSync]);

  return (
    <div className="space-y-6">
      <TrackForm />

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <h2 className="text-base font-semibold">
            Tracked containers {data && <span className="font-normal text-slate-500">({data.total})</span>}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">All statuses</option>
              {statuses.data?.map((s) => <option key={s.status} value={s.status}>{humanize(s.status)} ({s.count})</option>)}
            </select>
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search container or master bill" aria-label="Search containers"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-64" />
            <button type="button" onClick={() => runSync()} disabled={syncing}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>

        {(syncError || (syncResult && !syncResult.throttled)) && (
          <p role="status" className={`border-b border-slate-100 px-4 py-2 text-xs ${syncError || syncResult?.rateLimited || syncResult?.failed ? 'text-amber-800' : 'text-slate-500'}`}>
            {syncError ? `Sync failed: ${syncError.message}`
              : syncResult && `Synced ${fmtDate(syncResult.at)}: ${syncResult.added} new, ${syncResult.updated} updated`
                + (syncResult.failed ? `, ${syncResult.failed} failed` : '')
                + (syncResult.rateLimited ? '. OpenTrack rate limit reached, the rest will sync next time.' : '')}
          </p>
        )}

        {error && <p role="alert" className="p-4 text-sm text-rose-700">Couldn’t load containers: {error.message}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {['Container', 'Master bill', 'Status', 'ETA at terminal', 'Last free day', 'Demurrage owed', 'Updated'].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>}
              {data?.items.map((c) => {
                const d = daysUntil(c.lastFreeDay);
                return (
                  <tr key={c.containerId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/containers/${c.containerId}`} className="font-semibold text-harbor hover:underline">{c.containerId}</Link>
                      <div className="text-xs text-slate-500">{c.destination ?? c.scacCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      {c.masterBillNumber ? <Link to={`/master-bills/${c.masterBillNumber}`} className="hover:underline">{c.masterBillNumber}</Link> : '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">{fmtDate(c.etaAtTerminal, false)}</td>
                    <td className="px-4 py-3">
                      {fmtDate(c.lastFreeDay, false)}
                      {d !== undefined && c.status !== 'DELIVERED' && (
                        <div className={`text-xs ${d < 0 ? 'font-medium text-rose-700' : d <= 2 ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                          {d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Due today' : `${d} day${d === 1 ? '' : 's'} left`}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 ${c.demurrageOwed ? 'font-medium text-rose-700' : ''}`}>{fmtMoney(c.demurrageOwed)}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(c.updatedAt)}</td>
                  </tr>
                );
              })}
              {data && !data.items.length && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {debounced || status ? 'No containers match those filters.' : 'Nothing tracked yet. Add a container or master bill above.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <span className="text-slate-500">{isFetching ? 'Updating…' : `Page ${page} of ${pages}`}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
