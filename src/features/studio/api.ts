// Studio endpoints on the backend (which proxies them to the AI service).
import http from "@/lib/axios";
import { apiUrl } from "@/lib/apiBase";

/** Turns a backend error body into a plain Error carrying the Vietnamese message. */
function fail(err: any): never {
  const body = err?.response?.data;
  const detail = body?.errors?.[0] ?? body?.message ?? body?.detail ?? err?.response?.statusText ?? err?.message;
  throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
}

/**
 * BE bọc mọi response thành `{ success, data }`, còn panel Studio đọc thẳng payload
 * của AI service — nên bóc một lớp ngay tại đây.
 */
async function call<T = any>(fn: () => Promise<{ data: any }>): Promise<T> {
  try {
    const body = (await fn()).data;
    return body?.success === true ? body.data : body;
  } catch (err) {
    return fail(err);
  }
}

const job = (id: string) => `/studio/jobs/${encodeURIComponent(id)}`;

export const api = {
  bootstrap: () => call(() => http.get("/studio/bootstrap")),
  createJob: (body: any) => call(() => http.post("/studio/jobs", body)),
  getJob: (id: string) => call(() => http.get(job(id))),
  select: (id: string, body: any) => call(() => http.post(`${job(id)}/select`, body)),
  emotion: (id: string, partId: string, emotion: string | null) =>
    call(() => http.post(`${job(id)}/parts/${encodeURIComponent(partId)}/emotion`, { emotion })),
  settings: (id: string, partial: any) => call(() => http.patch(`${job(id)}/settings`, partial)),
  undo: (id: string) => call(() => http.post(`${job(id)}/undo`)),
  /** Plain URL: the hand-off package is downloaded by the browser via a link. */
  packageUrl: (id: string) => apiUrl(`${job(id)}/package`),
  aiModels: () => call(() => http.get("/studio/ai-models")),
};
