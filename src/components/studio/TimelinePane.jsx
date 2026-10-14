// CapCut-style multi-track timeline: toolbar + track headers with toggles, parts, picture shots,
// subtitles, VO, music, SFX, logo.
import { useLayoutEffect, useRef, useState } from "react";
import { setUi, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { fmtTime, media, GEN_LABEL } from "@/lib/formatHelpers";

const HEAD = 132;

function Head({ name, toggle, busy, onToggle }) {
  if (!toggle) {
    return (
      <div className="tl-head">
        <span className="name">{name}</span>
      </div>
    );
  }
  const [, on, icons] = toggle;
  return (
    <div className="tl-head">
      <span className="name">{name}</span>
      <button className={on ? "" : "off"} title="Bật/tắt" disabled={!!busy} onClick={onToggle}>
        {on ? icons[0] : icons[1]}
      </button>
    </div>
  );
}

function Row({ name, cls = "", toggle = null, busy, onToggle, children }) {
  const muted = toggle && !toggle[1] ? " muted" : "";
  return (
    <div className={`tl-row ${cls}${muted}`}>
      <Head name={name} toggle={toggle} busy={busy} onToggle={onToggle} />
      {children}
    </div>
  );
}

function Playhead({ pxPerSec }) {
  const playhead = useEditorStore((s) => s.playhead);
  return <div className="tl-playhead" style={{ left: `${HEAD + playhead * pxPerSec}px` }} />;
}

function TimelineInner({ boot, job, zoom, sel, busy, width: clientWidth }) {
  const actions = useStudioActions();
  const cfg = job.settings || {};
  const T = job.timeline.duration;
  const pxPerSec = Math.max(12, Math.floor((clientWidth - HEAD - 20) / Math.max(T, 1))) * zoom;
  const width = T * pxPerSec;
  const step = zoom >= 2 ? 1 : 5;
  const ticks = Array.from({ length: Math.ceil(T / step) + 1 }, (_, i) => i);

  const blockStyle = (start, dur, extra) => ({
    left: `${start * pxPerSec}px`,
    width: `${Math.max(dur * pxPerSec - 2, 3)}px`,
    ...extra,
  });

  const pick = (partId, shotIndex) =>
    setUi({
      sel: { part: partId, shot: shotIndex },
      seekTo: job.parts.find((p) => p.part_id === partId).shots[shotIndex]?.start,
    });

  const toggleTrack = (key) =>
    actions.settings(
      key === "music" ? { music_volume: (cfg.music_volume ?? 0.32) > 0 ? 0 : 0.32 } : { [key]: cfg[key] === false },
    );

  const shotBlock = (shot) => {
    const selected = shot.selected;
    const isActive = sel.part === shot.part_id && sel.shot === shot.index ? " active" : "";
    const key = `${shot.part_id}:${shot.index}`;
    const common = {
      title: `${fmtTime(shot.start)} · ${shot.duration.toFixed(1)}s`,
      onClick: () => pick(shot.part_id, shot.index),
    };
    if (selected.kind === "clip") {
      const clip = job.clips[selected.clip_id] || {};
      const fx = [selected.speed && Math.abs(selected.speed - 1) > 0.01 ? `${selected.speed}×` : "", selected.zoom ? `⊕${selected.zoom}` : ""]
        .filter(Boolean)
        .join(" ");
      return (
        <div
          key={key}
          {...common}
          className={`tl-block shot${clip.rights === "collected" ? " collected" : ""}${isActive}`}
          style={blockStyle(shot.start, shot.duration, { backgroundImage: `url('${media(clip.thumb)}')` })}
        >
          <span className="tag">{clip.rights === "collected" ? "SƯU TẦM" : clip.product_set || "VCB"}</span>
          {fx ? <span className="fx">{fx}</span> : ""}
        </div>
      );
    }
    const gen = job.parts.flatMap((p) => p.gen_options || []).find((g) => g.gen_id === selected.gen_id);
    const label = selected.kind === "gen" ? (gen?.type === "shoot_request" ? "⚑ QUAY BỔ SUNG" : "AI") : "⚠ THIẾU";
    return (
      <div
        key={key}
        {...common}
        className={`tl-block ${selected.kind === "gen" ? "shot gen" : "shot missing"}${isActive}`}
        style={blockStyle(shot.start, shot.duration)}
      >
        <b>{label}</b>
        <br />
        <small>{GEN_LABEL[gen?.type] || ""}</small>
      </div>
    );
  };

  return (
    <div className="tl-inner" style={{ width: `${width + HEAD + 20}px` }}>
      <div
        className="tl-ruler"
        style={{ width: `${width}px` }}
        onClick={(e) => setUi({ seekTo: (e.clientX - e.currentTarget.getBoundingClientRect().left) / pxPerSec })}
      >
        {ticks.map((i) => (
          <span key={i} style={{ left: `${i * step * pxPerSec}px` }}>
            {i * step}s
          </span>
        ))}
      </div>
      <Row name="Phần kịch bản" cls="parts" busy={busy}>
        {job.parts.map((p) => (
          <div
            key={p.part_id}
            className={`tl-block part ${p.status}`}
            style={blockStyle(p.start, p.duration)}
            onClick={() => pick(p.part_id, 0)}
          >
            <b>{p.role_label}</b>
            {p.craft_step ? " · " + p.craft_step.replace(/_/g, " ") : ""}
          </div>
        ))}
      </Row>
      <Row
        name="Văn bản"
        toggle={["subtitles", cfg.subtitles !== false, ["👁", "🚫"]]}
        busy={busy}
        onToggle={() => toggleTrack("subtitles")}
      >
        {job.timeline.subtitles.map((c, i) => (
          <div key={i} className="tl-block sub" style={blockStyle(c.start, c.end - c.start)}>
            {c.text}
          </div>
        ))}
      </Row>
      <Row name="Hình chính" cls="main" busy={busy}>
        {job.timeline.shots.map(shotBlock)}
      </Row>
      <Row name="Lồng tiếng" busy={busy}>
        {job.timeline.vo.map((v, i) => (
          <div key={i} className="tl-block voice" style={blockStyle(v.start, v.duration)}>
            🎙 {v.direction ? v.direction : ""} {v.duration.toFixed(1)}s
          </div>
        ))}
      </Row>
      <Row
        name="Nhạc nền"
        toggle={["music", (cfg.music_volume ?? 0.32) > 0, ["🔊", "🔇"]]}
        busy={busy}
        onToggle={() => toggleTrack("music")}
      >
        <div className="tl-block music" style={blockStyle(0, T)}>
          ♪ {boot.music.find((m) => m.id === cfg.music_track)?.name || "nhạc nền"} ·{" "}
          {Math.round((cfg.music_volume ?? 0.32) * 100)}% · tự hạ khi có giọng
        </div>
      </Row>
      <Row name="SFX" toggle={["sfx", cfg.sfx !== false, ["🔊", "🔇"]]} busy={busy} onToggle={() => toggleTrack("sfx")}>
        {job.timeline.sfx.map((x, i) => (
          <div key={i} className="tl-block sfx" style={blockStyle(x.start, 1.2)}>
            {x.kind}
          </div>
        ))}
      </Row>
      <Row
        name="Logo"
        toggle={["logo", cfg.logo !== false, ["👁", "🚫"]]}
        busy={busy}
        onToggle={() => toggleTrack("logo")}
      >
        {job.timeline.logo.map((l, i) => (
          <div key={i} className="tl-block logo" style={blockStyle(l.start, l.end - l.start)}>
            ◆ logo HuyK
          </div>
        ))}
      </Row>
      <Playhead pxPerSec={pxPerSec} />
    </div>
  );
}

export default function TimelinePane({ boot, job }) {
  const actions = useStudioActions();
  const zoom = useEditorStore((s) => s.zoom);
  const sel = useEditorStore((s) => s.sel);
  const busy = useEditorStore((s) => s.busy);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const measure = () => setWidth(containerRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const rendering = job?.render.status === "rendering";

  return (
    <section className="pane timeline-pane">
      <div className="tl-toolbar">
        <button
          className="tool-btn"
          title="Hoàn tác (Ctrl/⌘+Z)"
          disabled={!job?.history?.length || !!busy}
          onClick={() => actions.undo()}
        >
          ↶ Hoàn tác
        </button>
        <span className="tool-sep" />
        <span className={`busy${busy || rendering ? "" : " hidden"}`}>
          {busy ? `⏳ ${busy}…` : "⏳ đang dựng lại video…"}
        </span>
        <span className="spacer" />
        <div className="legend">
          <span>
            <i className="sw real" />
            Footage VCB
          </span>
          <span>
            <i className="sw collected" />
            Sưu tầm
          </span>
          <span>
            <i className="sw gen" />
            AI generate
          </span>
          <span>
            <i className="sw missing" />⚠ Thiếu
          </span>
        </div>
        <span className="tool-sep" />
        <label className="zoom">
          🔍{" "}
          <input
            type="range"
            min="1"
            max="4"
            step="0.25"
            value={zoom}
            onChange={(e) => setUi({ zoom: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="timeline" ref={containerRef}>
        {boot && job ? (
          <TimelineInner boot={boot} job={job} zoom={zoom} sel={sel} busy={busy} width={width} />
        ) : boot ? (
          <p className="muted pad">Timeline sẽ hiện sau khi dựng video.</p>
        ) : null}
      </div>
    </section>
  );
}
