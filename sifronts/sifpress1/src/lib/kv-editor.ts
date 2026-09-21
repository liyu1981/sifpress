import { useQuery } from '@tanstack/react-query';
import { authApi, kvsApi, type AuthUser, type KvPair } from 'ui-sdk';

export const SIFRONT_AUTH_QUERY_KEY = ['sifront-auth'] as const;

export function sifrontAuthQuery() {
  return {
    queryKey: SIFRONT_AUTH_QUERY_KEY,
    queryFn: authApi.me,
    retry: false,
    staleTime: 60_000,
  };
}

export function useSifrontAuth(): AuthUser | null {
  return useQuery(sifrontAuthQuery()).data ?? null;
}

export function canWriteKvs(user: AuthUser | null): boolean {
  return user !== null && (user.roles.includes('admin') || user.permissions.includes('kvs.write'));
}

/**
 * Resolve whether the signed-in visitor may edit a specific KV pair, and
 * return the pair when it exists. Anonymous visitors skip the lookup.
 */
export function useKvEditAccess(kvKey: string): {
  canEdit: boolean;
  existing: KvPair | null;
  isLoading: boolean;
} {
  const auth = useQuery(sifrontAuthQuery());
  const user = auth.data ?? null;
  const writable = canWriteKvs(user);

  const kv = useQuery({
    queryKey: ['kv-edit', kvKey],
    queryFn: () => kvsApi.get(kvKey),
    enabled: user !== null,
    retry: false,
    staleTime: 30_000,
  });

  const existing = kv.data ?? null;
  const canEdit = user !== null && (existing?.can_edit === true || (kv.isError && writable));

  return {
    canEdit,
    existing,
    isLoading: auth.isLoading || (user !== null && kv.isLoading),
  };
}
