/** VITE_APP_URL trống = cùng origin (SameSite cookie). Chỉ điền khi cố ý gọi thẳng origin khác. */
export const APP_URL = String(import.meta.env.VITE_APP_URL || "").replace(/\/$/, "");

const PROXY = ["/api", "/media", "/web", "/wv", "/__login"];

function isAppPath(path) {
  return PROXY.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

export function appUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return APP_URL ? `${APP_URL}${p}` : p;
}

export const apiCreds = APP_URL ? "include" : "same-origin";

export function installAppUrl() {
  if (typeof window === "undefined") return;
  window.appUrl = appUrl;
  const orig = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const src = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    let next = src;
    if (src.startsWith("/") && !src.startsWith("//") && isAppPath(src.split("#")[0])) next = appUrl(src);
    const creds = APP_URL ? "include" : init.credentials || "same-origin";
    if (typeof input === "string") return orig(next, { ...init, credentials: creds });
    if (input instanceof Request) {
      const req = next === src ? input : new Request(next, input);
      return orig(req, { ...init, credentials: creds });
    }
    return orig(input, { ...init, credentials: creds });
  };
}
