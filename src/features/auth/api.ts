import http, { forgetCsrf, rememberCsrf } from "@/lib/axios";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  roles: string[];
  isActive: boolean;
  lastLoginAt: string | null;
}

/** BE bọc mọi response thành { success, data } — bóc một lớp ở đây. */
const unwrap = <T,>(payload: { data?: T } | T): T =>
  (payload as { data?: T })?.data !== undefined ? ((payload as { data: T }).data) : (payload as T);

export async function login(email: string, password: string): Promise<CurrentUser> {
  const res = await http.post("/auth/login", { email, password });
  rememberCsrf(res.data?.data?.csrfToken);
  return res.data.data.user;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await http.get("/auth/me");
  return unwrap<CurrentUser>(res.data);
}

export async function logout(): Promise<void> {
  try {
    await http.post("/auth/logout");
  } finally {
    // Cookie đã bị BE xoá; dọn nốt CSRF trong bộ nhớ dù request có lỗi.
    forgetCsrf();
  }
}
