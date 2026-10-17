/** Backend API. Gọi thẳng, không đi qua Vite proxy. */
const raw = String(import.meta.env.VITE_API_URL || "http://localhost:3011/api/v1")
  .trim()
  .replace(/\/$/, "");

export const API_BASE: string = raw || "http://localhost:3011/api/v1";

/** Origin của BE — dùng ghép /media (proxy, thumb, render). */
export const API_ORIGIN: string = /^https?:\/\//i.test(API_BASE) ? new URL(API_BASE).origin : "";

/** Absolute URL for a backend path, e.g. apiUrl("/studio/bootstrap"). */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;
