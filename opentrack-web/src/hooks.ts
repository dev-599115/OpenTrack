import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type BookingFilters } from './lib/api';
import { pickList, toEvent, toWebhook } from './lib/normalize';
import type { Webhook } from './types';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The list is served from the API's local index, which webhooks and /sync keep current. The app-wide default turns off
 * refetch-on-focus, which is why the dashboard looked frozen; here we poll (paused automatically while the tab is hidden)
 * and refetch on focus so server-side changes show up without a manual reload.
 */
const LIVE = { refetchInterval: 30_000, refetchOnWindowFocus: true } as const;

export const useContainerList = (p: { search?: string; status?: string; page: number; pageSize: number }) =>
  useQuery({ queryKey: ['containers', p], queryFn: () => api.listContainers(p), placeholderData: keepPreviousData, ...LIVE });

export const useStatusCounts = () =>
  useQuery({ queryKey: ['containers', 'statuses'], queryFn: api.containerStatuses, ...LIVE });

export function useSyncContainers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.syncContainers,
    // Sync rewrites rows the list, facets and open detail pages are built from.
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['containers'] }),
      qc.invalidateQueries({ queryKey: ['container'] }),
    ]),
  });
}

export const useContainer = (id: string) =>
  useQuery({ queryKey: ['container', id], queryFn: () => api.getContainer(id), refetchInterval: 60_000 });

export const useRoute = (id: string, enabled: boolean) =>
  useQuery({ queryKey: ['route', id], queryFn: () => api.getRoute(id), enabled, staleTime: 5 * 60_000 });

export const useMasterBill = (number: string) =>
  useQuery({
    queryKey: ['masterBill', number],
    queryFn: () => api.getMasterBill(number),
    refetchInterval: (q) => (q.state.data?.status === 'LOCATING' ? 15_000 : false),
  });

export function useTrackContainer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.trackContainer, onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }) });
}

export function useTrackMasterBill() {
  const qc = useQueryClient();
  // The API now indexes the containers it gets back on import; make the dashboard pick them up.
  return useMutation({ mutationFn: api.trackMasterBill, onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }) });
}

export function useRemoveContainer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.removeContainer, onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }) });
}

// ---- Webhook admin + event replay ---------------------------------------------------------------------------------

export const useWebhooks = () =>
  useQuery({
    queryKey: ['webhooks'],
    queryFn: api.listWebhooks,
    select: (raw): Webhook[] => pickList(raw).map(toWebhook).filter((w): w is Webhook => !!w),
    retry: false, // 401/403 (not an admin) should surface immediately
  });

export function useRegisterWebhook() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.registerWebhook, onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }) });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.deleteWebhook, onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }) });
}

/** On demand (not a query): replaying hits OpenTrack once per click. */
export const useReplayEvents = () => useMutation({ mutationFn: api.replayEvents });

export const parseEvents = (raw: unknown) => pickList(raw).map(toEvent);

// ---- Bookings --------------------------------------------------------------------------------------------------------

/** Runs only once filters are submitted (userCountry is mandatory upstream). Results are cached for a minute. */
export const useBookings = (filters: BookingFilters | null) =>
  useQuery({
    queryKey: ['bookings', filters],
    queryFn: () => api.listBookings(filters as BookingFilters),
    enabled: filters !== null,
    staleTime: 60_000,
  });
