import { humanize } from '../lib/format';

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-300',
  blue: 'bg-sky-50 text-sky-800 ring-sky-300',
  violet: 'bg-violet-50 text-violet-800 ring-violet-300',
  amber: 'bg-amber-50 text-amber-900 ring-amber-400',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  red: 'bg-rose-50 text-rose-800 ring-rose-300',
} as const;

export function statusTone(s: string): keyof typeof TONES {
  if (s === 'NOT_FOUND') return 'red';
  if (['DISCOVERING', 'DISCOVERED', 'BOOKED'].includes(s)) return 'gray';
  if (s === 'DELIVERED' || s === 'EMPTY_RETURNED') return 'green';
  if (s.startsWith('AVAILABLE')) return 'amber'; // ready to collect: demurrage clock is running
  if (s.includes('RAIL')) return 'violet';
  if (s.startsWith('EMPTY')) return 'gray';
  return 'blue';
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[statusTone(status)]}`}>
      {humanize(status)}
    </span>
  );
}
