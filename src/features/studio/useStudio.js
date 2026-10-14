// Server state for the studio: bootstrap + the current job, plus the editor actions.
// Mirrors the legacy `editor-store.js`: every action returns the updated job, which replaces
// the cached job (ignoring stale revisions) and makes the whole editor re-render.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { setUi, useEditorStore } from "@/store/useEditorStore";

const BOOT_KEY = ["studio", "bootstrap"];
const jobKey = (id) => ["studio", "job", id];

/** Legacy `setJob`: drop stale revisions, then keep the selection pointing at a part that exists. */
function adoptJob(queryClient, job) {
  const prev = queryClient.getQueryData(jobKey(job.id));
  if (prev && job.id === prev.id && job.render.revision < prev.render.revision) return prev;
  queryClient.setQueryData(jobKey(job.id), job);
  const { sel, jobId } = useEditorStore.getState();
  if (!job.parts.some((p) => p.part_id === sel.part)) {
    setUi({ sel: { part: job.parts[0]?.part_id, shot: 0 } });
  }
  if (jobId !== job.id) setUi({ jobId: job.id });
  return job;
}

export function useBootstrap() {
  return useQuery({ queryKey: BOOT_KEY, queryFn: api.bootstrap, staleTime: Infinity, retry: false });
}

/**
 * The job. While the backend is re-rendering we poll at the legacy 900ms cadence;
 * transient failures just retry on the next tick.
 */
export function useJob() {
  const queryClient = useQueryClient();
  const jobId = useEditorStore((s) => s.jobId);
  return useQuery({
    queryKey: jobKey(jobId),
    enabled: !!jobId,
    queryFn: () => api.getJob(jobId).then((job) => adoptJob(queryClient, job)),
    refetchInterval: (query) => (query.state.data?.render?.status === "rendering" ? 900 : false),
    refetchOnWindowFocus: false,
  });
}

const currentJobId = () => useEditorStore.getState().jobId;

/** Editor actions. Each shows a busy label, applies the returned job, then follows the re-render. */
export function useStudioActions() {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: ({ action }) => action(),
    onMutate: ({ label }) => setUi({ busy: label }),
    onSuccess: (job) => adoptJob(queryClient, job),
    onError: (err, { label }) => alert(`${label}: ${err.message}`),
    onSettled: () => setUi({ busy: "" }),
  });

  return useMemo(() => {
    const run = (label, action) => mutate({ label, action });
    return {
      build: (body) => run("Đang lập kế hoạch, lồng tiếng giọng HuyK, chọn footage", () => api.createJob(body)),
      load: (id) => run("Đang mở dự án", () => api.getJob(id)),
      choose: (partId, shotIndex, option) =>
        run("Đang thay cảnh", () => api.select(currentJobId(), { part_id: partId, shot_index: shotIndex, option })),
      emotion: (partId, emotion) =>
        run("Đang đọc lại giọng HuyK với cảm xúc mới", () => api.emotion(currentJobId(), partId, emotion)),
      settings: (partial) =>
        run(partial.voice ? "Đang đổi giọng đọc" : "Đang áp dụng tùy chọn", () => api.settings(currentJobId(), partial)),
      undo: () => run("Đang hoàn tác", () => api.undo(currentJobId())),
    };
  }, [mutate]);
}

export function useAiModels() {
  return useQuery({ queryKey: ["studio", "ai-models"], queryFn: api.aiModels, staleTime: Infinity });
}
