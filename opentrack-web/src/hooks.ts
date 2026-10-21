import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './lib/api';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const useContainerList = (p: { search?: string; page: number; pageSize: number }) =>
  useQuery({ queryKey: ['containers', p], queryFn: () => api.listContainers(p), placeholderData: keepPreviousData });

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
  return useMutation({ mutationFn: api.trackMasterBill });
}

export function useRemoveContainer() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.removeContainer, onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }) });
}
