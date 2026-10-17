// Server state for the studio: bootstrap + the current job, plus the editor actions.
// Mirrors the legacy `editor-store.js`: every action returns the updated job, which replaces
// the cached job (ignoring stale revisions) and makes the whole editor re-render.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { rememberPendingVoice, setUi, useEditorStore } from "@/store/useEditorStore";

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
  // Bảng A4 và job phải cùng một dãy công đoạn sau mỗi lần đổi / dựng.
  if (job.sku && job.nas_plan?.craft?.length) {
    const cur = useEditorStore.getState().a4Draft;
    if (!cur || cur.sku === job.sku) {
      setUi({
        a4Draft: {
          sku: job.sku,
          shoot: job.nas_plan.shoot ?? cur?.shoot,
          shoots: cur?.shoots,
          craft: job.nas_plan.craft,
          huyk: job.nas_plan.huyk?.length ? job.nas_plan.huyk : cur?.huyk || [],
        },
      });
    }
  }
  return job;
}

export function useBootstrap() {
  return useQuery({ queryKey: BOOT_KEY, queryFn: api.bootstrap, staleTime: Infinity, retry: false });
}

/** Giọng trên tài khoản MiniMax. Danh sách chỉ đổi khi nhân bản giọng mới nên giữ lâu. */
export function useVoices() {
  return useQuery({
    queryKey: ["studio", "voices"],
    queryFn: () => api.voices().then((d) => d.voices || []),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
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
      // Mẫu giọng chọn sẵn ở tab Giọng được gửi kèm, để video dựng ra là đã đọc bằng giọng đó.
      build: (body) =>
        run("Đang lập kế hoạch, lồng tiếng, chọn footage", async () => {
          const voice = useEditorStore.getState().pendingVoice;
          const stored = voice ? { audio: voice.audio, upload_name: voice.upload_name } : null;
          const asSample = !!voice?.clone;      // mẫu giọng đã học được thì để giọng đó đọc kịch bản
          const job = await api.createJob({ ...body, ...(asSample && stored ? { voice: stored } : {}) });
          if (!voice) return job;
          if (asSample) {
            rememberPendingVoice(null);         // đã nằm trong dự án, không cần giữ chờ nữa
            return job;
          }
          setUi({ jobId: job.id, busy: "Đang cắt bản thu bạn tải lên theo từng phần" });
          const withVoice = await api.voiceApply(job.id, stored);
          rememberPendingVoice(null);
          return withVoice;
        }),
      load: (id) => run("Đang mở dự án", () => api.getJob(id)),
      choose: (partId, shotIndex, option) =>
        run("Đang thay cảnh", () => api.select(currentJobId(), { part_id: partId, shot_index: shotIndex, option })),
      craftStep: (partId, craft_step, label = "", path = "") =>
        run(
          craft_step === "random" ? "Đang bốc công đoạn chế tác khác" : "Đang đổi công đoạn và lấy source mới",
          () => api.craftStep(currentJobId(), partId, craft_step, label, path),
        ),
      craftPlan: (steps, labels = [], paths = []) =>
        run("Đang đổi tổ hợp công đoạn chế tác", () => api.craftPlan(currentJobId(), steps, labels, paths)),
      emotion: (partId, emotion) =>
        run("Đang đọc lại giọng HuyK với cảm xúc mới", () => api.emotion(currentJobId(), partId, emotion)),
      uploadVoice: (partId, file) =>
        run("Đang nạp file giọng đọc và dựng lại", () => api.voiceUpload(currentJobId(), partId, file)),
      clearVoice: (partId) =>
        run("Đang bỏ file giọng đọc, quay lại giọng máy", () => api.voiceUploadClear(currentJobId(), partId)),
      uploadJobVoice: (file) =>
        run("Đang cắt bản thu theo từng phần và dựng lại", () => api.voiceUploadJob(currentJobId(), file)),
      clearJobVoice: () =>
        run("Đang bỏ bản thu, quay lại giọng máy", () => api.voiceUploadJobClear(currentJobId())),
      cloneJobVoice: (file) =>
        run("Đang học giọng và đọc lại kịch bản", () => api.voiceClone(currentJobId(), file)),
      applyJobVoiceClone: (stored) =>
        run("Đang học giọng và đọc lại kịch bản", () => api.voiceCloneApply(currentJobId(), stored)),
      clearJobVoiceClone: () =>
        run("Đang bỏ giọng nhân bản, quay lại giọng mặc định", () => api.voiceCloneClear(currentJobId())),
      settings: (partial) =>
        run(partial.voice ? "Đang đổi giọng đọc" : "Đang áp dụng tùy chọn", () => api.settings(currentJobId(), partial)),
      undo: () => run("Đang hoàn tác", () => api.undo(currentJobId())),
    };
  }, [mutate]);
}

export function useAiModels() {
  return useQuery({ queryKey: ["studio", "ai-models"], queryFn: api.aiModels, staleTime: Infinity });
}
