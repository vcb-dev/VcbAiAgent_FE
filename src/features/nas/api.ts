// Kho footage trên ổ NAS. BE đọc từ Postgres nên các lời gọi dưới đây trả về ngay,
// trừ lần đầu lấy công đoạn của một sản phẩm — lúc đó BE mới chọc vào ổ để quét.
import http from "@/lib/axios";

async function call<T = any>(fn: () => Promise<{ data: any }>): Promise<T> {
  try {
    const body = (await fn()).data;
    return body?.success === true ? body.data : body;
  } catch (err: any) {
    const b = err?.response?.data;
    const detail = b?.errors?.[0] ?? b?.message ?? err?.message ?? "Lỗi không xác định";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

const enc = encodeURIComponent;

export type NasCategory = {
  code: string;
  label: string;
  products: number;
  ready?: number;
  syncedAt: string | null;
};
export type NasProduct = { sku: string; name: string; folders: string[]; craftSyncedAt: string | null };
export type NasCraftStep = {
  shoot: string;
  orderIndex: number | null;
  name: string;
  folder: string;
  step: string | null;
  clips: number;
  path: string;
};
export type NasHuykAction = Omit<NasCraftStep, "shoot">;
/** Kế hoạch tuyến A4 do BE bốc ngẫu nhiên từ kho công đoạn của chính mã đó. */
export type NasA4Plan = {
  sku: string;
  shoot: string | null;
  shoots: number;
  craft: NasCraftStep[];
  huyk: NasHuykAction[];
};

export const nas = {
  status: () => call(() => http.get("/nas/status")),
  categories: () => call<NasCategory[]>(() => http.get("/nas/categories")),
  products: (code: string, search = "", readyOnly = false) =>
    call<NasProduct[]>(() => {
      const q = new URLSearchParams();
      if (search) q.set("search", search);
      if (readyOnly) q.set("ready", "1");
      const qs = q.toString();
      return http.get(`/nas/categories/${enc(code)}/products${qs ? `?${qs}` : ""}`);
    }),
  craftSteps: (code: string, sku: string, refresh = false) =>
    call<NasCraftStep[]>(() =>
      http.get(`/nas/categories/${enc(code)}/products/${enc(sku)}/craft-steps${refresh ? "?refresh=1" : ""}`),
    ),
  a4Plan: (code: string, sku: string) =>
    call<NasA4Plan>(() => http.get(`/nas/categories/${enc(code)}/products/${enc(sku)}/a4-plan`)),
  huykActions: () => call<NasHuykAction[]>(() => http.get("/nas/huyk-actions")),
  /** Kéo footage tuyến A4 của mã này từ ổ về máy. Lần đầu mất vài phút. */
  prepare: (code: string, sku: string, body: { craft: string[]; huyk: string[] }) =>
    call(() => http.post(`/nas/categories/${enc(code)}/products/${enc(sku)}/prepare`, body)),
  syncProducts: () => call(() => http.post("/nas/sync/products")),
  syncHuyk: () => call(() => http.post("/nas/sync/huyk-actions")),
};
