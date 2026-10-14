// Inspector tabs "Giọng" (emotion direction + re-voice) and "Tốc độ & khung" (speed / punch-in zoom).
import { useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { media } from "@/lib/formatHelpers";

const EMOTION_VI = { "": "Tự nhiên", "[intrigued]": "Gợi tò mò", "[curious]": "Tò mò, hỏi", "[excited]": "Hào hứng", "[serious]": "Nghiêm túc",
  "[thoughtful]": "Trầm ngâm", "[softly, emotional]": "Nhẹ nhàng, xúc động", "[heartfelt]": "Chân thành, sâu lắng",
  "[warm, grateful]": "Ấm áp, biết ơn", "[admiring]": "Trầm trồ", "[playful]": "Dí dỏm", "[warm, confident]": "Ấm, tự tin (kết)" };
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function VoiceTab({ boot, part }) {
  const busy = useEditorStore((s) => s.busy);
  const actions = useStudioActions();
  const auto = part.emotion_override === undefined || part.emotion_override === null;
  const [emotion, setEmotion] = useState(auto ? "__auto" : part.emotion_override);
  if (!part.vo) return <p className="hint">Phần này chỉ có hình + nhạc (không có lời đọc).</p>;
  const isEleven = part.vo.provider?.startsWith("elevenlabs");
  const enabled = isEleven && !busy;

  return (
    <>
      <div className="part-head">
        <h3>Giọng đọc · {part.role_label}</h3>
        <span className={`chip ${isEleven ? "ok" : "warn"}`}>{isEleven ? "HuyK · eleven_v4" : "giọng demo"}</span>
      </div>
      <div className="vo">{part.vo_text}</div>
      <audio controls src={media(part.vo.audio)} style={{ width: "100%", margin: "6px 0" }} />
      <div className="hint">
        {part.vo.duration.toFixed(1)}s · {part.vo.provider}
        {part.vo.direction ? (
          <>
            {" "}
            · tag <b>{part.vo.direction}</b>
          </>
        ) : (
          ""
        )}
      </div>
      <div className="sec-title" style={{ marginTop: "14px" }}>
        Cảm xúc (audio tag eleven_v4)
      </div>
      <select value={emotion} disabled={!enabled} onChange={(e) => setEmotion(e.target.value)}>
        <option value="__auto">
          Tự động (agent chọn) — hiện: {EMOTION_VI[part.vo.direction || ""] || part.vo.direction || "Tự nhiên"}
        </option>
        {boot.emotions.map((t) => (
          <option key={t} value={t}>
            {EMOTION_VI[t] || t} {t ? t : ""}
          </option>
        ))}
      </select>
      <button
        className="primary"
        disabled={!enabled}
        onClick={() => actions.emotion(part.part_id, emotion === "__auto" ? null : emotion)}
      >
        🎙 Đọc lại với cảm xúc này
      </button>
      <p className="hint" style={{ marginTop: "8px" }}>
        Đọc lại cả kịch bản trong 1 lượt để cảm xúc nối mạch (~10–25s, ≈ $0,07). Tag không bị đọc thành lời (đã kiểm bằng Scribe).
        {isEleven ? (
          ""
        ) : (
          <>
            <br />
            Bật giọng HuyK ở tab Âm thanh (cần ElevenLabs API key).
          </>
        )}
      </p>
    </>
  );
}

export function SpeedTab({ job, part, shot }) {
  const busy = useEditorStore((s) => s.busy);
  const actions = useStudioActions();
  const sel = shot.selected;
  const [speed, setSpeed] = useState(sel.speed);
  const [zoom, setZoom] = useState(sel.zoom || 1);
  if (sel.kind !== "clip")
    return <p className="hint">Shot đang dùng đề xuất AI — chọn footage thật ở tab Cảnh để chỉnh tốc độ/khung.</p>;
  const clip = job.clips[sel.clip_id] || {};

  return (
    <>
      <div className="part-head">
        <h3>Tốc độ &amp; khung · shot {shot.index + 1}</h3>
        <span className="chip">{shot.duration.toFixed(1)}s</span>
      </div>
      <div className="hint" style={{ margin: "6px 0" }}>
        {clip.name} — nguồn {sel.src_in.toFixed(1)}s, khả dụng {(clip.usable || [0, 0]).join("–")}s
      </div>
      <div className="sec-title" style={{ marginTop: "12px" }}>
        Tốc độ
      </div>
      <div className="chips">
        {SPEEDS.map((v) => (
          <button key={v} className={`small-btn ${Math.abs(speed - v) < 0.01 ? "on" : ""}`} onClick={() => setSpeed(v)}>
            {v}×
          </button>
        ))}
      </div>
      <p className="hint">
        Cảnh chế tác mặc định 1,25× (như project CapCut thật dùng 1–2×). Nếu clip ngắn, agent tự giảm tốc độ để đủ thời lượng.
      </p>
      <div className="sec-title" style={{ marginTop: "14px" }}>
        Phóng khung (punch-in)
      </div>
      <div className="range-row">
        <input type="range" min="1" max="1.4" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        <output>{Number(zoom).toFixed(2)}×</output>
      </div>
      <button
        className="primary"
        disabled={!!busy}
        onClick={() => actions.choose(part.part_id, shot.index, { kind: "clip", clip_id: sel.clip_id, speed, zoom: Number(zoom) })}
      >
        Áp dụng cho shot này
      </button>
    </>
  );
}
