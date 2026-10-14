import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { fetchCurrentUser, login, logout } from "./api";

export const CURRENT_USER_KEY = ["currentUser"];

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }) => login(email, password),
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => queryClient.clear(),
  });
}

/** Tách 401 (hết phiên) khỏi lỗi mạng (BE restart) để không đá người dùng ra oan. */
export function isUnauthorized(error, failureReason) {
  for (const candidate of [error, failureReason]) {
    if (axios.isAxiosError(candidate) && candidate.response?.status === 401) return true;
  }
  return false;
}
