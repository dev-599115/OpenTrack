import type { Webhook, WebhookEvent } from '../types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : undefined;

const first = (o: Obj, ...keys: string[]) => {
  for (const k of keys) {
    const s = str(o[k]);
    if (s) return s;
  }
  return undefined;
};

/**
 * The webhook/event endpoints are proxied untouched, so the list may arrive as a bare array or wrapped
 * (`{ data: [...] }`, `{ data: { events: [...] } }`, ...). Returns the first array found.
 */
export function pickList(v: unknown, depth = 0): unknown[] {
  if (Array.isArray(v)) return v;
  if (!isObj(v) || depth > 2) return [];
  for (const k of ['data', 'webhooks', 'events', 'items', 'results']) {
    const found = pickList(v[k], depth + 1);
    if (found.length) return found;
  }
  return [];
}

export function toWebhook(r: unknown): Webhook | undefined {
  if (!isObj(r)) return undefined;
  const id = first(r, 'id', 'webhookId', '_id');
  if (!id) return undefined;
  const events = Array.isArray(r.events) ? r.events.filter((e): e is string => typeof e === 'string') : undefined;
  return { id, name: first(r, 'name'), url: first(r, 'url'), events, createdAt: first(r, 'createdAt', 'created_at') };
}

/** Accepts ISO strings or Unix epochs (seconds or milliseconds) and returns something `new Date()` can parse. */
function toIso(v?: string): string | undefined {
  if (!v || !/^\d{9,13}$/.test(v)) return v;
  const n = Number(v);
  return new Date(n < 1e11 ? n * 1000 : n).toISOString();
}

export function toEvent(r: unknown): WebhookEvent {
  if (!isObj(r)) return { event: 'unknown', raw: r };
  const data = isObj(r.data) ? r.data : undefined;
  return {
    id: first(r, 'id', 'eventId'),
    event: first(r, 'event', 'type', 'eventType') ?? 'unknown',
    containerId: first(r, 'containerId') ?? (data && first(data, 'containerId')),
    timestamp: toIso(first(r, 'timestamp', 'createdAt', 'occurredAt') ?? (data && first(data, 'timestamp'))),
    raw: r,
  };
}
