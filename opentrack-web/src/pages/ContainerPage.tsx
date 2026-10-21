import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary';
import RouteMap from '../components/RouteMap';
import StatusBadge from '../components/StatusBadge';
import Timeline from '../components/Timeline';
import { useContainer, useRemoveContainer, useRoute } from '../hooks';
import { api } from '../lib/api';
import { fmtDate, fmtMoney, fmtSize, fmtWeight, humanize } from '../lib/format';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children || '—'}</dd>
    </div>
  );
}

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="mb-3 text-base font-semibold">{title}</h2>
    {children}
  </section>
);

export default function ContainerPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: c, isLoading, error, isFetching } = useContainer(id);
  const route = useRoute(id, !!c);
  const remove = useRemoveContainer();
  const refresh = useMutation({
    mutationFn: () => api.getContainer(id, true),
    onSuccess: (fresh) => { qc.setQueryData(['container', id], fresh); qc.invalidateQueries({ queryKey: ['route', id] }); },
  });

  if (isLoading) return <p className="text-slate-500">Loading {id}…</p>;
  if (error || !c) {
    return (
      <div role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-800">
        <p className="font-semibold">Couldn’t load {id}</p>
        <p className="text-sm">{error?.message}</p>
        <Link to="/" className="mt-2 inline-block text-sm underline">Back to containers</Link>
      </div>
    );
  }

  const events = c.timeline?.length ? c.timeline : (c.history ?? []);
  const activeHolds = (c.holds ?? []).filter((h) => !h.resolvedAt);
  const vessel = c.currentVessel ?? c.vessel;

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-harbor hover:underline">← All containers</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.containerId}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {c.steamshipLine ?? c.scacCode}
            {c.masterBillNumber && <> · Master bill <Link className="underline" to={`/master-bills/${c.masterBillNumber}`}>{c.masterBillNumber}</Link></>}
            {vessel?.name && <> · {vessel.name}{c.voyageNumber ? ` (${c.voyageNumber})` : ''}</>}
          </p>
          {c.completionReason && <p className="mt-1 text-sm text-amber-800">Tracking stopped: {humanize(c.completionReason)}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => refresh.mutate()} disabled={refresh.isPending || isFetching}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            {refresh.isPending ? 'Refreshing…' : 'Refresh now'}
          </button>
          <button onClick={() => confirm(`Remove ${c.containerId} from this list? Tracking at OpenTrack is not cancelled.`) &&
              remove.mutate(c.containerId, { onSuccess: () => nav('/') })}
            className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
            Remove from list
          </button>
        </div>
      </div>

      {activeHolds.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">{activeHolds.length} active hold{activeHolds.length > 1 ? 's' : ''}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
            {activeHolds.map((h, i) => (
              <li key={i}>{h.type}{h.code ? ` (${h.code})` : ''}{h.remarks ? `: ${h.remarks}` : ''}{h.amountDue ? ` · ${fmtMoney(h.amountDue)} due` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Arrival and fees">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="ETA at terminal">{fmtDate(c.etaAtTerminal)}</Fact>
            <Fact label="Pickup appointment">{fmtDate(c.appointmentDate)}</Fact>
            <Fact label="Last free day (terminal)">{fmtDate(c.lastFreeDay, false)}</Fact>
            <Fact label="Last free day (line)">{fmtDate(c.lineLastFreeDay, false)}</Fact>
            <Fact label="Detention last free day">{fmtDate(c.detentionLastFreeDay, false)}</Fact>
            <Fact label="Demurrage owed">{fmtMoney(c.demurrageOwedAtPort)}</Fact>
            <Fact label="Demurrage incurred">{fmtMoney(c.demurrageIncurred)}</Fact>
            <Fact label="Carrier / customs release">{`${fmtDate(c.carrierReleasedDate, false)} / ${fmtDate(c.customsReleasedDate, false)}`}</Fact>
          </dl>
        </Panel>

        <Panel title="Journey">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="Origin port">{c.originPort?.name}</Fact>
            <Fact label="Destination port">{c.destinationPort?.name}</Fact>
            <Fact label="Final destination">{c.finalDestination?.name}</Fact>
            <Fact label="Current location">{c.currentLocation?.name}</Fact>
            <Fact label="Departed origin (ETD)">{fmtDate(c.etdFromOrigin)}</Fact>
            <Fact label="Terminal">{c.terminalAtDestinationPort?.name}</Fact>
            <Fact label="Yard location">{c.yardLocation}</Fact>
            <Fact label="Trade type">{humanize(c.tradeType)}</Fact>
          </dl>
        </Panel>

        <Panel title="Equipment">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="Size">{fmtSize(c.containerSize)}</Fact>
            <Fact label="Type">{humanize(c.containerType)}</Fact>
            <Fact label="Gross weight">{fmtWeight(c.grossWeight)}</Fact>
            <Fact label="Last update">{fmtDate(c.timestamp)}</Fact>
            {c.isRailMove && (
              <>
                <Fact label="Rail carrier">{c.railCarrier?.name}</Fact>
                <Fact label="Rail ramp">{c.finalRailStation?.name}</Fact>
                <Fact label="ETA at rail ramp">{fmtDate(c.etaAtDestination)}</Fact>
                <Fact label="Last free day (rail)">{fmtDate(c.lastFreeDayAtRailStation, false)}</Fact>
              </>
            )}
          </dl>
          {c.trackingPage && <a href={c.trackingPage} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-harbor underline">Open public tracking page</a>}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2"><Panel title="Milestones"><Timeline events={events} /></Panel></div>
        <div className="lg:col-span-3">
          <Panel title="Route">
            {route.isLoading ? <p className="text-sm text-slate-500">Loading route…</p>
              : route.error ? <p className="text-sm text-slate-500">Route isn’t available yet: {route.error.message}</p>
              : (
                <ErrorBoundary fallback={<p className="text-sm text-slate-500">The map couldn’t be drawn for this route.</p>}>
                  <RouteMap route={route.data?.data} />
                </ErrorBoundary>
              )}
          </Panel>
        </div>
      </div>
    </div>
  );
}