import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_BASE } from "./apiBase";

const CSRF_COOKIE = "vcb_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Token auth nằm trong cookie httpOnly nên instance này không bao giờ đụng tới token.
 * Việc của nó chỉ là: gắn header CSRF, và khi gặp 401 thì refresh đúng một lần rồi thử lại.
 */
export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

/* ─── CSRF ─────────────────────────────────────────────────────────────── */

let csrfMemory: string | null = null;
let csrfInFlight: Promise<string | null> | null = null;

function readCsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Login/refresh trả csrfToken trong body, dùng khi cookie không đọc được (deploy cross-site). */
export function rememberCsrf(token?: string | null) {
  if (token) csrfMemory = token;
}

export function forgetCsrf() {
  csrfMemory = null;
}

async function resolveCsrf(): Promise<string | null> {
  const fromCookie = readCsrfCookie();
  if (fromCookie) return fromCookie;
  if (csrfMemory) return csrfMemory;

  // Gộp các lời gọi đồng thời vào một request duy nhất.
  csrfInFlight ??= axios
    .get(`${API_BASE}/auth/csrf`, { withCredentials: true })
    .then((res) => {
      const token = res.data?.data?.csrfToken ?? res.data?.csrfToken ?? null;
      csrfMemory = token;
      return token;
    })
    .catch(() => null)
    .finally(() => {
      csrfInFlight = null;
    });

  return csrfInFlight;
}

/* ─── Refresh ──────────────────────────────────────────────────────────── */

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Dùng axios trần để không chạy lại interceptor của chính instance này — nhưng vẫn phải
 * tự gắn CSRF vì /auth/refresh là POST nên BE vẫn bắt buộc double-submit token.
 */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= resolveCsrf()
    .then((csrf) =>
      axios.post(`${API_BASE}/auth/refresh`, null, {
        withCredentials: true,
        headers: csrf ? { [CSRF_HEADER]: csrf } : undefined,
      }),
    )
    .then((res) => {
      rememberCsrf(res.data?.data?.csrfToken ?? res.data?.csrfToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

function redirectToLogin() {
  forgetCsrf();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
}

/* ─── Interceptors ─────────────────────────────────────────────────────── */

const isPath = (url: string | undefined, suffix: string) => (url ?? "").includes(suffix);

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? "get").toUpperCase();
  if (SAFE_METHODS.has(method)) return config;
  if (isPath(config.url, "/auth/login") || isPath(config.url, "/auth/csrf")) return config;

  const csrf = await resolveCsrf();
  if (csrf) config.headers.set(CSRF_HEADER, csrf);

  // Trình duyệt phải tự đặt boundary cho multipart.
  if (config.data instanceof FormData) config.headers.delete("Content-Type");
  return config;
});

http.interceptors.response.use(
  (response) => {
    rememberCsrf(response.data?.data?.csrfToken);
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    // Sai mật khẩu thì refresh cũng vô ích.
    if (status === 401 && isPath(original?.url, "/auth/login")) return Promise.reject(error);

    if (status === 401 && original && !original._retried && !isPath(original.url, "/auth/refresh")) {
      original._retried = true;
      if (await refreshSession()) return http(original);
    }

    if (status === 401) redirectToLogin();
    return Promise.reject(error);
  },
);

/** Lấy thông điệp lỗi tiếng Việt do BE trả về, tránh hiện chuỗi kỹ thuật cho người dùng. */
export function getApiErrorMessage(error: unknown, fallback = "Đã có lỗi xảy ra, vui lòng thử lại"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: string[] } | undefined;
    if (data?.errors?.length) return data.errors[0];
    if (data?.message) return data.message;
    if (!error.response) return "Không kết nối được máy chủ";
  }
  return fallback;
}

export default http;
