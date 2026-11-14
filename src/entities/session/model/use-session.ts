"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, type Session } from "@/shared/auth";
import type { RoleId } from "@/shared/config";

/** 세션 쿼리 키(어댑터가 바뀌어도 같음) */
export const SESSION_KEY = ["auth", "session"] as const;

/** 지금 세션(없으면 null). 화면 잠금은 이 값으로 표시만 한다 */
export function useSession() {
  const auth = useAuth();
  return useQuery({ queryKey: SESSION_KEY, queryFn: () => auth.getSession(), staleTime: Infinity });
}

export function useLogin() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: RoleId) => auth.login({ role }),
    onSuccess: (s: Session) => qc.setQueryData(SESSION_KEY, s),
  });
}

export function useSwitchRole() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: RoleId) => auth.switchRole(role),
    onSuccess: (s: Session) => qc.setQueryData(SESSION_KEY, s),
  });
}

export function useLogout() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => auth.logout(),
    onSuccess: () => qc.setQueryData(SESSION_KEY, null),
  });
}
