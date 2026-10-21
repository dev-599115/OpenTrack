import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrackContainer, useTrackMasterBill } from '../hooks';
import { CARRIERS } from '../lib/carriers';

const input =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-harbor';

export default function TrackForm() {
  const nav = useNavigate();
  const [mode, setMode] = useState<'container' | 'mbl'>('container');
  const [containerId, setContainerId] = useState('');
  const [scac, setScac] = useState('MAEU');
  const [mbl, setMbl] = useState('');

  const trackContainer = useTrackContainer();
  const trackMbl = useTrackMasterBill();
  const pending = trackContainer.isPending || trackMbl.isPending;
  const error = trackContainer.error ?? trackMbl.error;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'container') {
      trackContainer.mutate(
        { containerId: containerId.trim(), scacCode: scac, masterBillNumber: mbl.trim() },
        { onSuccess: (c) => nav(`/containers/${c.containerId}`) },
      );
    } else {
      trackMbl.mutate(
        { number: mbl.trim(), scacCode: scac || undefined },
        { onSuccess: (m) => nav(`/master-bills/${m.number}`) },
      );
    }
  }

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-harbor text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Track a shipment</h2>
        <div className="flex gap-1" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'container'} className={tab(mode === 'container')} onClick={() => setMode('container')}>Container</button>
          <button type="button" role="tab" aria-selected={mode === 'mbl'} className={tab(mode === 'mbl')} onClick={() => setMode('mbl')}>Master bill or booking</button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {mode === 'container' && (
          <label className="text-sm font-medium">Container number
            <input className={`${input} uppercase`} required maxLength={11} pattern="[A-Za-z]{4}[0-9]{7}" placeholder="MRKU2642087"
              value={containerId} onChange={(e) => setContainerId(e.target.value)} />
          </label>
        )}
        <label className="text-sm font-medium">{mode === 'container' ? 'Master bill number' : 'Master bill or booking number'}
          <input className={`${input} uppercase`} required minLength={6} maxLength={40} pattern="[A-Za-z0-9\-]{6,40}" placeholder="MAEU589677982"
            value={mbl} onChange={(e) => setMbl(e.target.value)} />
        </label>
        <label className="text-sm font-medium">Carrier
          <select className={input} value={scac} onChange={(e) => setScac(e.target.value)} required={mode === 'container'}>
            {mode === 'mbl' && <option value="">Prefixed in the number</option>}
            {CARRIERS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={pending}
            className="w-full rounded-md bg-harbor px-4 py-2 text-sm font-semibold text-white hover:bg-harbor-dark disabled:opacity-60">
            {pending ? 'Sending…' : 'Start tracking'}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error.message}</p>}
    </form>
  );
}
