// UI state of the editor (the non-server half of the legacy `editor-store.js` store).
// Server state (boot, job) lives in react-query — see features/studio/useStudio.js.
import { create } from "zustand";

export const useEditorStore = create((set) => ({
  jobId: null,
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
