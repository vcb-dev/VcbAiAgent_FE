// Small shared helpers for the studio UI (formatting, media URLs). React escapes text itself.

export const fmtTime = (s) => {
  const v = Math.max(0, Number(s) || 0);
  return `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, "0")}`;
};

export const money = (usd) => {
  const v = Number(usd) || 0;
  if (v === 0) return "$0";
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(v < 1 ? 3 : 2)}`;
};

import { API_ORIGIN } from "./apiBase";

export const media = (path) => {
  if (!path) return "";
  const value = String(path);
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_ORIGIN}/${value.replace(/^\/+/, "")}`;
};

export const STATUS_LABEL = { ok: "Đủ footage", gap: "⚠ Thiếu footage", needs_gen: "Dùng AI generate" };
export const STATUS_CHIP = { ok: "ok", gap: "bad", needs_gen: "ai" };
export const GEN_LABEL = {
  product_video: "AI · Cảnh sản phẩm (image-to-video)", huyk_avatar: "AI · HuyK nói (avatar khớp môi)",
  illustration: "AI · B-roll minh họa", shoot_request: "Phiếu quay bổ sung", missing: "Thiếu footage",
};
