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

function form(file: File): FormData {
  const body = new FormData();
  body.append("file", file);
  return body;
}

export const api = {
  bootstrap: () => call(() => http.get("/studio/bootstrap")),
  /** Giọng nhân bản có trên tài khoản MiniMax, để chọn người đọc cho video. */
  voices: () => call(() => http.get("/studio/voices")),
  createJob: (body: any) => call(() => http.post("/studio/jobs", body)),
  getJob: (id: string) => call(() => http.get(job(id))),
  select: (id: string, body: any) => call(() => http.post(`${job(id)}/select`, body)),
  emotion: (id: string, partId: string, emotion: string | null) =>
    call(() => http.post(`${job(id)}/parts/${encodeURIComponent(partId)}/emotion`, { emotion })),
  /** Đổi công đoạn chế tác (`random` = bốc một công đoạn khác) rồi lấy source mới. */
  craftStep: (id: string, partId: string, craft_step: string, label = "", path = "") =>
    call(() =>
      http.post(`${job(id)}/parts/${encodeURIComponent(partId)}/craft-step`, {
        craft_step,
        ...(label ? { label } : {}),
        ...(path ? { path } : {}),
      }),
    ),
  /** Đổi cả dãy công đoạn chế tác theo footage A4, chỉ dựng lại một lần. */
  craftPlan: (id: string, steps: string[], labels: string[] = [], paths: string[] = []) =>
    call(() => http.post(`${job(id)}/craft-plan`, { steps, labels, paths })),
  /** Lời đọc tự thu, tải từ máy lên cho một phần. Trình duyệt tự đặt boundary multipart. */
  voiceUpload: (id: string, partId: string, file: File) =>
    call(() => http.post(`${job(id)}/parts/${encodeURIComponent(partId)}/voice-upload`, form(file))),
  /** Một bản thu cả kịch bản, AI cắt ra cho từng phần. */
  voiceUploadJob: (id: string, file: File) => call(() => http.post(`${job(id)}/voice-upload`, form(file))),
  voiceUploadJobClear: (id: string) => call(() => http.post(`${job(id)}/voice-upload/clear`)),
  /** Cất bản thu lên máy chủ khi chưa có dự án; trả về đường dẫn để nghe lại và dùng sau. */
  voiceStore: (file: File) => call(() => http.post("/studio/voice-uploads", form(file))),
  voiceApply: (id: string, stored: { audio: string; upload_name: string }) =>
    call(() => http.post(`${job(id)}/voice-upload/apply`, stored)),
  /** Học giọng trong bản thu rồi cho chính giọng đó đọc kịch bản. */
  voiceClone: (id: string, file: File) => call(() => http.post(`${job(id)}/voice-clone`, form(file))),
  voiceCloneApply: (id: string, stored: { audio: string; upload_name: string }) =>
    call(() => http.post(`${job(id)}/voice-clone/apply`, stored)),
  voiceCloneClear: (id: string) => call(() => http.post(`${job(id)}/voice-clone/clear`)),
  voiceUploadClear: (id: string, partId: string) =>
    call(() => http.post(`${job(id)}/parts/${encodeURIComponent(partId)}/voice-upload/clear`)),
  settings: (id: string, partial: any) => call(() => http.patch(`${job(id)}/settings`, partial)),
  undo: (id: string) => call(() => http.post(`${job(id)}/undo`)),
  /** Plain URL: the hand-off package is downloaded by the browser via a link. */
  packageUrl: (id: string) => apiUrl(`${job(id)}/package`),
  aiModels: () => call(() => http.get("/studio/ai-models")),
  /** Gắn công đoạn chế tác (nung/đánh lửa, cưa…) cho clip đã kéo về. */
  labelClip: (clipId: string, craft_step: string | null) =>
    call(() => http.patch(`/studio/clips/${encodeURIComponent(clipId)}`, { craft_step })),
};
