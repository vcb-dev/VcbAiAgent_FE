// CapCut-style multi-track timeline: toolbar + track headers with toggles, parts, picture shots,
// subtitles, VO, music, SFX.
import { useLayoutEffect, useRef, useState } from "react";
import { setUi, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { useA4Plan } from "@/features/nas/useNas";
import { fmtTime, media, GEN_LABEL } from "@/lib/formatHelpers";
import { A4_TOTAL, slotLabel, slotSource, slotsTotal, slotsWithStart } from "@/lib/a4Route";
import { STEP_VI } from "./FootageTab";

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

/** Thước thời gian dùng chung cho timeline thật và bản xem trước. */
function Ruler({ total, pxPerSec, zoom, onSeek }) {
  const step = zoom >= 2 ? 1 : 5;
  const ticks = Array.from({ length: Math.ceil(total / step) + 1 }, (_, i) => i);
  return (
    <div
      className="tl-ruler"
      style={{ width: `${total * pxPerSec}px` }}
      onClick={onSeek ? (e) => onSeek((e.clientX - e.currentTarget.getBoundingClientRect().left) / pxPerSec) : undefined}
    >
      {ticks.map((i) => (
        <span key={i} style={{ left: `${i * step * pxPerSec}px` }}>
          {i * step}s
        </span>
      ))}
    </div>
  );
}

/**
 * Tuyến A4 vẽ sẵn trước khi dựng video.
 *
 * Trước đây chỗ này chỉ có một dòng chữ "timeline sẽ hiện sau khi dựng", nên editor không
 * thấy được bố cục công đoạn cho tới khi dựng xong. Thời lượng ở đây là thời lượng khung
 * của tuyến; lúc dựng thật mỗi phần sẽ co giãn theo lời đọc.
 */
function A4Preview({ zoom, width: clientWidth }) {
  const category = useEditorStore((s) => s.pickedCategory);
  const sku = useEditorStore((s) => s.pickedSku);
  const a4Draft = useEditorStore((s) => s.a4Draft);
  const plan = useA4Plan(category, sku);
  const draft = a4Draft?.sku === sku ? a4Draft : plan.data;
  const slots = slotsWithStart(draft?.slots);
  const total = slotsTotal(draft?.slots) || A4_TOTAL;
  const pxPerSec = Math.max(12, Math.floor((clientWidth - HEAD - 20) / total)) * zoom;
  const width = total * pxPerSec;

  const block = (slot, extra) => ({
    left: `${slot.start * pxPerSec}px`,
    width: `${Math.max(slot.seconds * pxPerSec - 2, 3)}px`,
    ...extra,
  });

  return (
    <div className="tl-inner" style={{ width: `${width + HEAD + 20}px` }}>
      <Ruler total={total} pxPerSec={pxPerSec} zoom={zoom} />
      <Row name="Phần kịch bản" cls="parts">
        {slots.map((slot, i) => (
          <div
            key={i}
            className="tl-block part preview"
            style={block(slot)}
            title={`${slotLabel(slot, draft, sku)} · ${slot.seconds}s`}
          >
            <b>{slotLabel(slot, draft, sku)}</b>
          </div>
        ))}
      </Row>
      <Row name="Hình chính" cls="main">
        {slots.map((slot, i) => {
          const source = slotSource(slot, draft, sku);
          return (
            <div
              key={i}
              className={`tl-block shot preview${source ? "" : " empty"}`}
              style={block(slot)}
              title={source || "chưa có nguồn"}
            >
              <small>{source || (sku ? "—" : "chọn sản phẩm")}</small>
            </div>
          );
        })}
      </Row>
      <div className="tl-note">
        {!sku
          ? "Tuyến A4 · chọn loại và sản phẩm ở tab Kịch bản để thấy nguồn footage từng công đoạn."
          : plan.isFetching
            ? `Tuyến A4 · ${sku} · đang bốc cảnh từ kho…`
            : draft?.craft?.length
              ? `Tuyến A4 · ${sku} · ${total}s khung mẫu — dựng video để có timeline thật theo lời đọc.`
              : `Tuyến A4 · ${sku} chưa có source chế tác trên ổ.`}
      </div>
    </div>
  );
}

function TimelineInner({ boot, job, zoom, sel, busy, width: clientWidth }) {
  const actions = useStudioActions();
  const a4Draft = useEditorStore((s) => s.a4Draft);
  const liveMusic = useEditorStore((s) => s.liveMusic);
  const a4 = a4Draft?.sku === job.sku ? a4Draft : job.nas_plan;
  const cfg = job.settings || {};
  const musicVol = liveMusic?.volume ?? cfg.music_volume ?? 0.38;
  const musicTrack = liveMusic?.track ?? cfg.music_track;
  const T = job.timeline.duration;
  const pxPerSec = Math.max(12, Math.floor((clientWidth - HEAD - 20) / Math.max(T, 1))) * zoom;
  const width = T * pxPerSec;

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

  const toggleTrack = (key) => {
    if (key === "music") {
      const next = musicVol > 0 ? 0 : 0.38;
      setUi({ liveMusic: { track: musicTrack || "default", volume: next } });
      actions.settings({ music_volume: next });
      return;
    }
    actions.settings({ [key]: cfg[key] === false });
  };

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
      <Ruler total={T} pxPerSec={pxPerSec} zoom={zoom} onSeek={(seekTo) => setUi({ seekTo })} />
      <Row name="Phần kịch bản" cls="parts" busy={busy}>
        {job.parts.map((p) => {
          const craftAt = p.role === "craft" ? job.parts.filter((x) => x.role === "craft").indexOf(p) : -1;
          const huykAt = p.role === "huyk_talk" ? job.parts.filter((x) => x.role === "huyk_talk").indexOf(p) : -1;
          const a4Name =
            craftAt >= 0
              ? a4?.craft?.[craftAt]?.name
              : huykAt >= 0
                ? a4?.huyk?.[huykAt]?.name || p.huyk_label
                : p.role === "product_hero" || p.role === "product_final"
                  ? job.product_name
                  : "";
          const stepName = p.craft_label || a4Name || STEP_VI[p.craft_step] || p.craft_step || p.huyk_label;
          return (
            <div
              key={p.part_id}
              className={`tl-block part ${p.status}`}
              style={blockStyle(p.start, p.duration)}
              onClick={() => pick(p.part_id, 0)}
            >
              <b>{p.role_label}</b>
              {stepName ? " · " + stepName : ""}
            </div>
          );
        })}
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
        {/* Outro phát tiếng sẵn trong clip, không phải máy đọc kịch bản. */}
        {(job.timeline.source_audio || []).map((s, i) => (
          <div key={`src${i}`} className="tl-block voice source" style={blockStyle(s.start, s.duration)}>
            🔊 tiếng gốc {s.duration.toFixed(1)}s
          </div>
        ))}
      </Row>
      <Row
        name="Nhạc nền"
        toggle={["music", musicVol > 0, ["🔊", "🔇"]]}
        busy={busy}
        onToggle={() => toggleTrack("music")}
      >
        {(() => {
          const musicEnd = job.timeline.music_end ?? T;
          if (!(musicEnd > 0) || !(musicVol > 0)) return null;
          return (
            <div className="tl-block music" style={blockStyle(0, musicEnd)}>
              ♪ {boot.music.find((m) => m.id === musicTrack)?.name || "nhạc nền"} ·{" "}
              {Math.round(musicVol * 100)}% · tắt trước outro
            </div>
          );
        })()}
      </Row>
      <Row name="SFX" toggle={["sfx", cfg.sfx !== false, ["🔊", "🔇"]]} busy={busy} onToggle={() => toggleTrack("sfx")}>
        {job.timeline.sfx.map((x, i) => (
          <div key={i} className="tl-block sfx" style={blockStyle(x.start, 1.2)}>
            {x.kind}
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
        ) : boot && width ? (
          <A4Preview zoom={zoom} width={width} />
        ) : null}
      </div>
    </section>
  );
}
