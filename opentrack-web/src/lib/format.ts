export const humanize = (s?: string) =>
  (s ?? '').toLowerCase().split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function fmtDate(iso?: string, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(d);
}

export const fmtMoney = (n?: number) =>
  n === undefined || n === null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);

export const fmtWeight = (kg?: number) => (kg ? `${new Intl.NumberFormat().format(Math.round(kg))} kg` : '—');

/** Days until the date (negative = overdue). Undefined when no date. */
export function daysUntil(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? undefined : Math.ceil((t - Date.now()) / 86_400_000);
}

const SIZES: Record<string, string> = {
  TWENTY_FT: '20 ft', FORTY_FT: '40 ft', FORTY_FT_HC: '40 ft high cube', FORTY_FIVE_FT_HC: '45 ft high cube',
};
export const fmtSize = (s?: string) => (s ? (SIZES[s] ?? humanize(s)) : '—');