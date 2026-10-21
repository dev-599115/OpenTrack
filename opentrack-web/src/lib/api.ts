import type { Container, ContainerSummary, MasterBill, Paged, RouteResponse } from '../types';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  // When Auth:Enabled=true on the API, store your IdP access token here after login.
  const token = localStorage.getItem('access_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText || 'Request failed';
    let code: string | undefined;
    try {
      const p = await res.json();
      message = p.errors ? Object.values(p.errors as Record<string, string[]>).flat().join(' ') : (p.detail ?? p.title ?? message);
      code = p.code;
    } catch { /* non-JSON body */ }
    throw new ApiError(res.status, message, code);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface TrackContainerBody { containerId: string; scacCode: string; masterBillNumber: string }
export interface TrackMasterBillBody { number: string; scacCode?: string }

export const api = {
  listContainers: (p: { search?: string; status?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
    return request<Paged<ContainerSummary>>(`/api/containers?${qs}`);
  },
  trackContainer: (body: TrackContainerBody) =>
    request<Container>('/api/containers', { method: 'POST', body: JSON.stringify(body) }),
  getContainer: (id: string, refresh = false) =>
    request<Container>(`/api/containers/${encodeURIComponent(id)}?refresh=${refresh}`),
  getRoute: (id: string) => request<RouteResponse>(`/api/containers/${encodeURIComponent(id)}/route`),
  removeContainer: (id: string) =>
    request<void>(`/api/containers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  trackMasterBill: (body: TrackMasterBillBody) =>
    request<MasterBill>('/api/master-bills', { method: 'POST', body: JSON.stringify(body) }),
  getMasterBill: (number: string) => request<MasterBill>(`/api/master-bills/${encodeURIComponent(number)}`),
};
