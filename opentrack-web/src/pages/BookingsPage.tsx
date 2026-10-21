import { FormEvent, Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBookings, useTrackContainer } from '../hooks';
import type { BookingFilters } from '../lib/api';
import { scacFor } from '../lib/carriers';
import type { Booking } from '../types';

const PAGE_SIZE = 25;
const COUNTRY_KEY = 'bookings.userCountry';
const CONTAINER_RX = /^[A-Za-z]{4}\d{7}$/;
const MBL_RX = /^[A-Za-z0-9-]{6,40}$/;

const field = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm';

// Browser storage can be unavailable (private mode, policy); the page must work without it.
const readCountry = () => { try { return localStorage.getItem(COUNTRY_KEY) ?? ''; } catch { return ''; } };
const saveCountry = (v: string) => { try { localStorage.setItem(COUNTRY_KEY, v); } catch { /* ignore */ } };

type View = 'all' | 'containers' | 'bookings';

const DETAILS: [string, (b: Booking) => string | undefined][] = [
  ['Party', (b) => b.partyName],
  ['Consignee', (b) => b.consignee],
  ['Customer', (b) => b.customer],
  ['House bill', (b) => b.houseBillOfLadingNumber],
  ['Program', (b) => b.program],
  ['Distribution center', (b) => b.distributionCenter],
  ['Destination address', (b) => b.destinationAddress],
  ['Destination CFS', (b) => b.destinationContainerFreightStation],
  ['Origin CFS', (b) => b.originContainerFreightStation],
];

const dash = (v?: string) => (v && v.trim() ? v : '—');

export default function BookingsPage() {
  const nav = useNavigate();

  const [country, setCountry] = useState(readCountry);
  const [cutoff, setCutoff] = useState('');
  const [jobNo, setJobNo] = useState('');
  const [containerNo, setContainerNo] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<BookingFilters | null>(null);

  const [view, setView] = useState<View>('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  const { data, isFetching, error, refetch } = useBookings(applied);
  const track = useTrackContainer();

  function submit(e: FormEvent) {
    e.preventDefault();
    const userCountry = country.trim();
    if (!userCountry) return;
    saveCountry(userCountry);
    setPage(1);
    setOpen(new Set());
    setApplied({
      userCountry,
      cutoff: cutoff ? new Date(cutoff).toISOString() : undefined, // date input -> UTC midnight
      jobNo: jobNo.trim() || undefined,
      containerNo: containerNo.trim().toUpperCase() || undefined,
      search: search.trim() || undefined,
    });
  }

  const rows = data ?? [];
  const stats = useMemo(() => {
    const distinct = (pick: (b: Booking) => string | undefined) => new Set(rows.map(pick).filter(Boolean)).size;
    return {
      rows: rows.length,
      containers: distinct((b) => b.containerId),
      bills: distinct((b) => b.masterBillNumber),
      jobs: distinct((b) => b.jobNumber),
      pending: rows.filter((b) => !b.containerId).length,
    };
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((b) => (view === 'all' ? true : view === 'containers' ? !!b.containerId : !b.containerId)),
    [rows, view],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const offset = (current - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);

  const toggle = (i: number) =>
    setOpen((cur) => { const next = new Set(cur); if (!next.delete(i)) next.add(i); return next; });

  function trackRow(b: Booking) {
    const scac = scacFor(b.carrierName, b.masterBillNumber);
    if (!scac || !b.containerId || !b.masterBillNumber) return;
    track.mutate(
      { containerId: b.containerId.trim().toUpperCase(), scacCode: scac, masterBillNumber: b.masterBillNumber.trim().toUpperCase() },
      { onSuccess: (c) => nav(`/containers/${c.containerId}`) },
    );
  }

  /** Why a row can't be tracked yet, or undefined when it can. */
  function trackBlocker(b: Booking): string | undefined {
    if (!b.containerId) return 'No container assigned yet';
    if (!CONTAINER_RX.test(b.containerId.trim())) return 'Container number isn’t in the 4 letters + 7 digits format';
    if (!b.masterBillNumber || !MBL_RX.test(b.masterBillNumber.trim())) return 'Needs a valid master bill number';
    if (!scacFor(b.carrierName, b.masterBillNumber)) return 'Carrier not recognised; track it from the dashboard form';
    return undefined;
  }

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-harbor text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookings and containers</h1>
        <p className="mt-1 text-sm text-slate-600">
          Jobs from the bookings service with their master bills and containers. Track any container to follow it here.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm font-medium">Country
            <input className={field} required maxLength={60} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. US" />
          </label>
          <label className="text-sm font-medium">Cutoff date
            <input className={field} type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          </label>
          <label className="text-sm font-medium">Job number
            <input className={field} maxLength={60} value={jobNo} onChange={(e) => setJobNo(e.target.value)} />
          </label>
          <label className="text-sm font-medium">Container number
            <input className={`${field} uppercase`} maxLength={11} value={containerNo} onChange={(e) => setContainerNo(e.target.value)} />
          </label>
          <label className="text-sm font-medium">Search
            <input type="search" className={field} maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PO, supplier, party…" />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={isFetching}
            className="rounded-md bg-harbor px-4 py-2 text-sm font-semibold text-white hover:bg-harbor-dark disabled:opacity-60">
            {isFetching ? 'Loading…' : applied ? 'Apply filters' : 'Load bookings'}
          </button>
          {applied && !isFetching && (
            <button type="button" onClick={() => refetch()} className="text-sm text-harbor underline">Reload</button>
          )}
        </div>
      </form>

      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Couldn’t load bookings</p>
          <p>{error.message}</p>
        </div>
      )}
      {track.error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">Couldn’t start tracking: {track.error.message}</p>
      )}

      {!applied && <p className="text-sm text-slate-500">Enter a country and load bookings to see results.</p>}

      {applied && data && (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <p className="text-sm text-slate-600" aria-live="polite">
              {stats.rows} row{stats.rows === 1 ? '' : 's'} · {stats.jobs} job{stats.jobs === 1 ? '' : 's'} ·{' '}
              {stats.bills} master bill{stats.bills === 1 ? '' : 's'} · {stats.containers} container{stats.containers === 1 ? '' : 's'}
              {stats.pending > 0 && ` · ${stats.pending} without a container`}
            </p>
            <div className="flex gap-1" role="tablist" aria-label="Row type">
              {([['all', 'All'], ['containers', 'With container'], ['bookings', 'No container yet']] as [View, string][]).map(([v, label]) => (
                <button key={v} role="tab" aria-selected={view === v} className={tab(view === v)} onClick={() => { setView(v); setPage(1); }}>{label}</button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {['Job / PO', 'Master bill', 'Container', 'Carrier', 'Customer', 'Supplier', 'Destination', ''].map((h, i) => (
                    <th key={i} className="px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((b, i) => {
                  const idx = offset + i;
                  const expanded = open.has(idx);
                  const blocker = trackBlocker(b);
                  const busy = track.isPending && track.variables?.containerId === b.containerId?.trim().toUpperCase();
                  return (
                    <Fragment key={idx}>
                      <tr className="align-top hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{dash(b.jobNumber)}</div>
                          <div className="text-xs text-slate-500">{b.poNumber ? `PO ${b.poNumber}` : ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          {b.masterBillNumber
                            ? <Link to={`/master-bills/${b.masterBillNumber}`} className="hover:underline">{b.masterBillNumber}</Link>
                            : '—'}
                          <div className="text-xs text-slate-500">{b.houseBillOfLadingNumber ? `HBL ${b.houseBillOfLadingNumber}` : ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          {b.containerId
                            ? <Link to={`/containers/${b.containerId}`} className="font-semibold text-harbor hover:underline">{b.containerId}</Link>
                            : <span className="text-slate-500">Not assigned</span>}
                          <div className="text-xs text-slate-500">{b.containerSize ?? ''}</div>
                        </td>
                        <td className="px-4 py-3">{dash(b.carrierName)}</td>
                        <td className="px-4 py-3">{dash(b.customer ?? b.consignee ?? b.partyName)}</td>
                        <td className="px-4 py-3">{dash(b.supplier)}</td>
                        <td className="px-4 py-3">{dash(b.distributionCenter ?? b.destinationAddress)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button onClick={() => trackRow(b)} disabled={!!blocker || track.isPending} title={blocker ?? 'Start tracking this container'}
                            className="mr-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                            {busy ? 'Starting…' : 'Track'}
                          </button>
                          <button onClick={() => toggle(idx)} aria-expanded={expanded} aria-controls={`booking-details-${idx}`}
                            className="rounded-md px-2 py-1.5 text-harbor hover:bg-slate-100">
                            {expanded ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr id={`booking-details-${idx}`} className="bg-slate-50">
                          <td colSpan={8} className="px-4 py-3">
                            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                              {DETAILS.map(([label, get]) => (
                                <div key={label}>
                                  <dt className="text-xs text-slate-500">{label}</dt>
                                  <dd className="mt-0.5 text-sm font-medium">{dash(get(b))}</dd>
                                </div>
                              ))}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!pageRows.length && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    {rows.length ? 'No rows of this type.' : 'No bookings match those filters.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">{isFetching ? 'Updating…' : `Page ${current} of ${pages}`}</span>
            <div className="flex gap-2">
              <button disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button disabled={current >= pages} onClick={() => setPage(current + 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
