import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { AuthUser } from '@/lib/pages';
import { authApi } from '@/lib/pages';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  isAdmin: boolean;
  has: (permission: string) => boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (new_password: string, current_password?: string) => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: authApi.me,
    retry: false,
    staleTime: 30_000,
  });

  const loginMutation = useMutation({
    mutationFn: (args: { username: string; password: string }) =>
      authApi.login(args.username, args.password),
    onSuccess: user => {
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (args: { new_password: string; current_password?: string }) =>
      authApi.changePassword(args.new_password, args.current_password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });

  const user: AuthUser | null = meQuery.data ?? null;
  const status: AuthStatus =
    meQuery.isLoading || meQuery.isPending ? 'loading' : user ? 'authenticated' : 'anonymous';

  const value: AuthContextValue = {
    status,
    user,
    isAdmin: user?.roles.includes('admin') ?? false,
    has: permission => user?.permissions.includes(permission) ?? false,
    login: (username, password) => loginMutation.mutateAsync({ username, password }),
    logout: () => logoutMutation.mutateAsync().then(() => undefined),
    changePassword: (new_password, current_password) =>
      changePasswordMutation.mutateAsync({ new_password, current_password }).then(() => undefined),
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
