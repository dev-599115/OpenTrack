import { Link, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { useMasterBill } from '../hooks';
import { fmtDate, fmtMoney } from '../lib/format';

export default function MasterBillPage() {
  const { number = '' } = useParams();
  const { data, isLoading, error } = useMasterBill(number);

  if (isLoading) return <p className="text-slate-500">Loading {number}…</p>;
  if (error || !data) return (
    <div role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-800">
      <p className="font-semibold">Couldn’t load {number}</p>
      <p className="text-sm">{error?.message}</p>
      <Link to="/" className="mt-2 inline-block text-sm underline">Back to containers</Link>
    </div>
  );

  const containers = data.containers ?? [];
  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-harbor hover:underline">← All containers</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{data.number}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data.scacCode} · {data.status === 'LOCATING' ? 'OpenTrack is still finding the containers on this bill. This page checks again every 15 seconds.'
            : data.status === 'ARCHIVED' ? 'Tracking for this bill has ended.' : `${containers.length} container${containers.length === 1 ? '' : 's'} tracked`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>{['Container', 'Status', 'Vessel', 'Destination', 'ETA at terminal', 'Last free day', 'Demurrage owed'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {containers.map((c) => (
              <tr key={c.containerId} className="hover:bg-slate-50">
                <td className="px-4 py-3"><Link to={`/containers/${c.containerId}`} className="font-semibold text-harbor hover:underline">{c.containerId}</Link></td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-3">{(c.currentVessel ?? c.vessel)?.name ?? '—'}</td>
                <td className="px-4 py-3">{c.finalDestination?.name ?? c.destinationPort?.name ?? '—'}</td>
                <td className="px-4 py-3">{fmtDate(c.etaAtTerminal, false)}</td>
                <td className="px-4 py-3">{fmtDate(c.lastFreeDay, false)}</td>
                <td className={`px-4 py-3 ${c.demurrageOwedAtPort ? 'font-medium text-rose-700' : ''}`}>{fmtMoney(c.demurrageOwedAtPort)}</td>
              </tr>
            ))}
            {!containers.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No containers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
