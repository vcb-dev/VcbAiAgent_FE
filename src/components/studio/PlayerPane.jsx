// Player pane: custom transport bar (play/pause, timecode, fullscreen), render overlays, seek requests.
import { useEffect, useRef, useState } from "react";
import { setUi, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { media } from "@/lib/formatHelpers";

const tc = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export default function PlayerPane({ job }) {
  const videoRef = useRef(null);
  const loadedUrlRef = useRef("");
  const pendingTimeRef = useRef(null);
  const jobRef = useRef(job);
  jobRef.current = job;

  const busy = useEditorStore((s) => s.busy);
  const seekTo = useEditorStore((s) => s.seekTo);
  const actions = useStudioActions();
  const [{ time, duration, paused }, setMedia] = useState({ time: 0, duration: 0, paused: true });

  const render = job?.render;
  const sync = () => {
    const v = videoRef.current;
    setMedia({ time: v.currentTime || 0, duration: v.duration || 0, paused: v.paused });
    setUi({ playhead: v.currentTime || 0 });
  };

  // Load a freshly rendered video, keeping the current position.
  useEffect(() => {
    const v = videoRef.current;
    if (render?.status === "done" && render.url !== loadedUrlRef.current) {
      loadedUrlRef.current = render.url;
      pendingTimeRef.current = v.currentTime;
      v.poster = media(render.poster || "");
      v.src = `${media(render.url)}?r=${render.revision}`;
    }
  }, [render?.status, render?.url, render?.revision]);

  // Seek requests coming from the timeline.
  useEffect(() => {
    if (seekTo != null && render?.status === "done") {
      videoRef.current.currentTime = seekTo + 0.05;
      setUi({ seekTo: null });
    }
  }, [seekTo, render?.status]);

  // Keyboard shortcuts: Space = play/pause, Ctrl/⌘+Z = undo.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (["TEXTAREA", "INPUT", "SELECT"].includes(e.target.tagName)) return;
      const v = videoRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        if (v.paused) v.play();
        else v.pause();
      }
      const { busy: isBusy } = useEditorStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && jobRef.current?.history?.length && !isBusy) {
        e.preventDefault();
        actions.undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);

  const busyText = busy || (render?.status === "rendering" ? `Đang dựng video (bản ${render.revision})…` : "");
  const overlayShown = !!busyText || render?.status === "error";
  const overlayText =
    render?.status === "error" ? `Lỗi render: ${render.error}` : `${busyText}…`.replace("……", "…");

  return (
    <section className="pane player-pane">
      <div className="pane-head">
        <span>Trình phát</span>
        <span className="muted">
          {render?.status === "done" ? `bản ${render.revision} · render ${render.seconds}s · ${job.template_label}` : ""}
        </span>
      </div>
      <div className="player-stage">
        <div className="player-wrap">
          <video
            id="player"
            ref={videoRef}
            playsInline
            preload="auto"
            onTimeUpdate={sync}
            onPlay={sync}
            onPause={sync}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (pendingTimeRef.current != null) {
                v.currentTime = Math.min(pendingTimeRef.current, v.duration || pendingTimeRef.current);
                pendingTimeRef.current = null;
              }
              sync();
            }}
          />
          <div className={`overlay${overlayShown ? "" : " hidden"}`}>{overlayText}</div>
          <div className={`overlay${job || busy ? " hidden" : ""}`}>
            <span>
              Chọn kịch bản ở tab <b>Kịch bản</b> rồi bấm <b>Dựng video</b>
            </span>
          </div>
        </div>
      </div>
      <div className="player-bar">
        <span className="mono">
          {tc(time)} / {tc(duration || job?.timeline.duration || 0)}
        </span>
        <button
          className="icon-btn play"
          title="Phát / dừng (Space)"
          onClick={() => {
            const v = videoRef.current;
            if (v.paused) v.play();
            else v.pause();
          }}
        >
          {paused ? "▶" : "❚❚"}
        </button>
        <div className="bar-right">
          <span className="chip">9:16 · 1080×1920</span>
          <button className="icon-btn" title="Toàn màn hình" onClick={() => videoRef.current.requestFullscreen?.()}>
            ⛶
          </button>
        </div>
      </div>
    </section>
  );
}
