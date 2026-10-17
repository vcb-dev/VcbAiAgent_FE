/** Backend API — relative để cùng origin với FE (prod proxy / local Vite proxy). */
const raw = String(import.meta.env.VITE_API_URL || "/api/v1")
  .trim()
  .replace(/\/$/, "");

export const API_BASE: string = raw || "/api/v1";

/** Origin tuyệt đối nếu VITE_API_URL là URL đầy đủ; để trống thì media dùng cùng host với trang. */
export const API_ORIGIN: string = /^https?:\/\//i.test(API_BASE) ? new URL(API_BASE).origin : "";

export const apiUrl = (path: string): string => `${API_BASE}${path}`;
