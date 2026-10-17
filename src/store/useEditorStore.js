// UI state of the editor (the non-server half of the legacy `editor-store.js` store).
// Server state (boot, job) lives in react-query — see features/studio/useStudio.js.
import { create } from "zustand";

const VOICE_KEY = "vcb_pending_voice";

/** Bản thu đã cất trên máy chủ: giữ qua lần tải lại trang, vì file nằm sẵn ở đó rồi. */
function readPendingVoice() {
  try {
    return JSON.parse(localStorage.getItem(VOICE_KEY) || "null");
  } catch {
    return null;
  }
}

export function rememberPendingVoice(voice) {
  if (voice) localStorage.setItem(VOICE_KEY, JSON.stringify(voice));
  else localStorage.removeItem(VOICE_KEY);
  setUi({ pendingVoice: voice });
}

export const useEditorStore = create((set) => ({
  jobId: null,
  // Mã sản phẩm đang chọn ở tab Kịch bản. Tab Footage lọc theo mã này ngay từ lúc chọn,
  // chứ chờ tới khi job dựng xong mới có `job.sku` thì lúc đó mới lọc được là quá muộn.
  pickedSku: "",
  pickedCategory: "",
  // Kế hoạch A4 editor đang chỉnh (4 chế tác + 2 HuyK). Timeline xem trước và lúc dựng đọc cùng bản này.
  a4Draft: null,
  // Bản thu editor chọn ở tab Giọng trước khi có dự án; áp vào ngay sau khi dựng.
  pendingVoice: readPendingVoice(),
  sel: { part: "p1", shot: 0 },
  libTab: "script",
  inspTab: "scene",
  zoom: 1,
  busy: "",
  seekTo: null,
  playhead: 0,

  /** Same shape as the legacy `setUi(patch)`: merge a partial into the store. */
  setUi: (patch) => set(patch),
}));

export const setUi = (patch) => useEditorStore.getState().setUi(patch);

export const currentPart = (job, sel) =>
  job?.parts.find((p) => p.part_id === sel.part) || job?.parts[0];

export const currentShot = (job, sel) => {
  const part = currentPart(job, sel);
  return part ? part.shots[Math.min(sel.shot, part.shots.length - 1)] : null;
};
