import type { Milestone } from '../types';
import { fmtDate, humanize } from '../lib/format';

export default function Timeline({ events }: { events: Milestone[] }) {
  if (!events.length) return <p className="text-sm text-slate-500">No milestones reported yet. Carriers usually publish the first events within a few hours of import.</p>;

  const sorted = [...events].sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime());

  return (
    <ol className="relative ml-2 border-l-2 border-slate-200">
      {sorted.map((e, i) => (
        <li key={`${e.milestone}-${e.timestamp}-${i}`} className="relative pb-5 pl-6 last:pb-0">
          <span className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${i === 0 ? 'bg-harbor' : 'bg-slate-400'}`} />
          <p className="text-sm font-semibold">{humanize(e.milestone)}</p>
          <p className="text-sm text-slate-600">
            {[e.location?.name, e.vessel?.name].filter(Boolean).join(' · ') || 'Location not reported'}
          </p>
          <p className="text-xs text-slate-500">{fmtDate(e.timestamp)}</p>
        </li>
      ))}
    </ol>
  );
}
