// Inspector tabs "Giọng" (emotion + re-voice) and "Nhạc nền" (track + volume).
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rememberPendingVoice, setUi, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { api } from "@/features/studio/api";
import { media } from "@/lib/formatHelpers";

const EMOTION_VI = { "": "Tự nhiên", "[intrigued]": "Gợi tò mò", "[curious]": "Tò mò, hỏi", "[excited]": "Hào hứng", "[serious]": "Nghiêm túc",
  "[thoughtful]": "Trầm ngâm", "[softly, emotional]": "Nhẹ nhàng, xúc động", "[heartfelt]": "Chân thành, sâu lắng",
  "[warm, grateful]": "Ấm áp, biết ơn", "[admiring]": "Trầm trồ", "[playful]": "Dí dỏm", "[warm, confident]": "Ấm, tự tin (kết)" };
const AUDIO_ACCEPT = "audio/*,video/mp4,video/quicktime";

/** Tên người đọc ứng với mã nhà cung cấp, để giao diện không phải hiện chuỗi kỹ thuật. */
function providerName(provider = "") {
  if (provider.startsWith("minimax")) return "giọng bạn nhân bản";
  if (provider.startsWith("elevenlabs")) return "giọng HuyK · ElevenLabs";
  if (provider.startsWith("macos_say")) return "giọng máy · macOS “Linh”";
  if (provider === "upload") return "bản thu của bạn";
  return provider;
}

/**
 * Giọng thật sự đang đọc video, kể cả khi chưa dựng.
 *
 * Không đọc thẳng `settings.voice`: chọn giọng HuyK mà máy chủ chưa có ElevenLabs key thì
 * thực tế vẫn là giọng máy, hiện đúng tên đó còn hơn để editor tưởng đang nghe giọng HuyK.
 */
function currentVoice(boot, job, clone, recording, pending) {
  if (clone && !clone.audio) return `giọng chọn từ MiniMax — ${clone.label || clone.voice_id}`;
  if (clone) return `giọng bạn nhân bản — ${clone.upload_name}`;
  if (recording) return `bản thu của bạn — ${recording.upload_name}`;
  if (pending?.clone) return `giọng bạn nhân bản — ${pending.upload_name}`;
  if (pending) return `bản thu của bạn — ${pending.upload_name}`;
  const wantsHuyk = (job?.settings?.voice ?? "huyk") === "huyk";
  if (!wantsHuyk) return "giọng máy · macOS “Linh”";
  if (boot?.eleven_available) return "giọng HuyK · ElevenLabs eleven_v4";
  if (boot?.huyk_voice_available) return "giọng HuyK · nhân bản trên MiniMax";
  return "giọng máy · macOS “Linh”";
}

/** Nút chọn file dùng chung cho cả hai mức: cả video và riêng một phần. */
function PickFile({ label, disabled, onPick }) {
  const ref = useRef(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={AUDIO_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";          // chọn lại đúng file vừa bỏ vẫn phải kích hoạt onChange
          if (file) onPick(file);
        }}
      />
      <button className="small-btn" disabled={disabled} onClick={() => ref.current?.click()}>
        ⤒ {label}
      </button>
    </>
  );
}

/**
 * Giọng đọc cho cả video.
 *
 * Mặc định file tải lên là *mẫu giọng*: hệ thống học giọng rồi cho chính giọng đó đọc nội
 * dung trong kịch bản, nên sửa chữ là có lời đọc mới mà không phải thu lại. Chế độ còn lại
 * dùng thẳng bản thu làm lời đọc, hợp khi editor đã thu sẵn đúng kịch bản.
 *
 * Dùng được cả khi chưa dựng video — lúc đó giọng được giữ lại trong store và áp ngay khi
 * bấm Dựng, để editor không phải dựng bằng giọng máy rồi mới thay.
 */
function JobVoice({ boot, job }) {
  const busy = useEditorStore((s) => s.busy);
  const pending = useEditorStore((s) => s.pendingVoice);
  const actions = useStudioActions();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [asSample, setAsSample] = useState(true);
  const clone = job?.voice_clone;
  const recording = job?.voice_upload;
  const shown = clone || recording || pending;      // đã dựng thì lấy của dự án, chưa thì lấy bản vừa cất
  const sampleReady = !!(clone || pending?.clone);

  /** Chưa có dự án thì cất lên máy chủ ngay: nghe lại được, học giọng luôn, và không mất khi tải lại trang. */
  const store = async (file) => {
    setSaving(true);
    setError("");
    try {
      const stored = await api.voiceStore(file);
      rememberPendingVoice(stored);
      setError(asSample && stored.clone_error ? stored.clone_error : "");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const pick = (file) => {
    if (!job) return store(file);
    return asSample ? actions.cloneJobVoice(file) : actions.uploadJobVoice(file);
  };

  return (
    <>
      <div className="part-head">
        <h3>Giọng đọc cả video</h3>
        <span className={`chip ${shown ? "ok" : ""}`}>
          {clone ? "giọng của bạn đọc" : recording ? "file tự thu" : shown ? "đã lưu" : "giọng mặc định"}
        </span>
      </div>
      <div className="hint" style={{ margin: "4px 0 8px" }}>
        Đang dùng: <b style={{ color: "var(--ink)" }}>{currentVoice(boot, job, clone, recording, pending)}</b>
      </div>

      <div className="chips" style={{ margin: "2px 0 8px" }}>
        <button className={`small-btn ${asSample ? "on" : ""}`} onClick={() => setAsSample(true)}>
          Giọng này đọc nội dung
        </button>
        <button className={`small-btn ${asSample ? "" : "on"}`} onClick={() => setAsSample(false)}>
          Dùng thẳng làm lời đọc
        </button>
      </div>

      {shown?.audio && (
        <>
          <audio controls src={media(shown.audio)} style={{ width: "100%", margin: "6px 0" }} />
          <div className="hint">
            <b style={{ color: "var(--ink)" }}>{shown.upload_name}</b> · {shown.duration?.toFixed(1)}s
            {clone
              ? " · đã học giọng, đang đọc nội dung kịch bản"
              : recording
                ? ` · đã cắt cho ${recording.parts} phần có lời đọc`
                : pending?.clone
                  ? " · đã học giọng, chờ dựng video"
                  : " · đã lưu, chờ dựng video"}
          </div>
        </>
      )}

      <div className="chips" style={{ marginTop: "8px" }}>
        <PickFile
          label={shown ? "Chọn file khác" : asSample ? "Tải mẫu giọng từ máy" : "Tải bản thu từ máy"}
          disabled={!!busy || saving}
          onPick={pick}
        />
        {job && (clone || recording) && (
          <button
            className="small-btn"
            disabled={!!busy}
            onClick={() => (clone ? actions.clearJobVoiceClone() : actions.clearJobVoice())}
          >
            ↺ Về giọng máy đọc
          </button>
        )}
        {job && pending && !clone && sampleReady && (
          <button
            className="small-btn"
            disabled={!!busy}
            onClick={() => actions.applyJobVoiceClone({ audio: pending.audio, upload_name: pending.upload_name })}
          >
            🎙 Đọc lại bằng giọng này
          </button>
        )}
        {!job && pending && (
          <button className="small-btn" disabled={saving} onClick={() => rememberPendingVoice(null)}>
            ✕ Bỏ file
          </button>
        )}
      </div>

      <p className="hint">
        {saving ? (
          asSample ? "Đang tải lên và học giọng…" : "Đang tải bản thu lên…"
        ) : error ? (
          <span style={{ color: "#e66767" }}>{error}</span>
        ) : pending && !job && sampleReady ? (
          <>
            Đã học xong giọng. Bấm <b>Dựng video</b> là giọng này đọc nội dung bạn viết ở tab Kịch bản.
          </>
        ) : asSample ? (
          <>
            Tải một đoạn bạn nói (mp3, wav, m4a, aac hoặc mp4/mov), <b>từ 10 giây trở lên</b>, tối đa 25 MB. Hệ thống
            học giọng rồi đọc đúng nội dung trong kịch bản — nội dung đọc dài bao nhiêu thì video dài bấy nhiêu.
          </>
        ) : (
          <>
            Đọc sẵn cả kịch bản trong một file, hệ thống cắt ra từng phần theo chỗ bạn ngắt hơi giữa các đoạn.
          </>
        )}
      </p>
    </>
  );
}

export function VoiceTab({ boot, job, part }) {
  return (
    <>
      <JobVoice boot={boot} job={job} />
      <div className="sec-title" style={{ marginTop: "18px" }}>
        Riêng từng phần
      </div>
      {part ? (
        <PartVoice boot={boot} part={part} />
      ) : (
        <p className="hint">Chọn một khối trên timeline để nghe và chỉnh riêng lời đọc của phần đó.</p>
      )}
    </>
  );
}

function PartVoice({ boot, part }) {
  const busy = useEditorStore((s) => s.busy);
  const actions = useStudioActions();
  const auto = part.emotion_override === undefined || part.emotion_override === null;
  const [emotion, setEmotion] = useState(auto ? "__auto" : part.emotion_override);
  if (part.source_audio)
    return <p className="hint">Phần này phát tiếng sẵn trong clip (không lồng giọng đọc lên).</p>;
  if (!part.vo) return <p className="hint">Phần này chỉ có hình + nhạc (không có lời đọc).</p>;
  const upload = part.vo_upload;
  const isEleven = part.vo.provider?.startsWith("elevenlabs");
  const isClone = part.vo.provider?.startsWith("minimax");
  // Tag cảm xúc là của eleven_v4; file tự thu và giọng nhân bản không áp được.
  const enabled = isEleven && !upload && !busy;

  return (
    <>
      <div className="part-head">
        <h3>Giọng đọc · {part.role_label}</h3>
        <span className={`chip ${upload || isEleven || isClone ? "ok" : "warn"}`}>
          {upload ? "file tự thu" : isClone ? "giọng của bạn" : isEleven ? "HuyK · eleven_v4" : "giọng demo"}
        </span>
      </div>
      <div className="vo">{part.vo_text}</div>
      <audio controls src={media(part.vo.audio)} style={{ width: "100%", margin: "6px 0" }} />
      <div className="hint">
        {part.vo.duration.toFixed(1)}s · {upload ? upload.upload_name : providerName(part.vo.provider)}
        {part.vo.direction && !upload ? (
          <>
            {" "}
            · tag <b>{part.vo.direction}</b>
          </>
        ) : (
          ""
        )}
      </div>

      <div className="chips" style={{ marginTop: "10px" }}>
        <PickFile
          label={upload ? "Chọn file khác cho phần này" : "Tải file cho riêng phần này"}
          disabled={!!busy}
          onPick={(file) => actions.uploadVoice(part.part_id, file)}
        />
        {upload && (
          <button className="small-btn" disabled={!!busy} onClick={() => actions.clearVoice(part.part_id)}>
            ↺ Về giọng máy đọc
          </button>
        )}
      </div>
      <p className="hint">Thời lượng phần này bám theo file vừa tải, nên hình được cắt lại cho khớp.</p>

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
        {upload ? (
          <>
            <br />
            Phần này đang dùng file tự thu nên không chỉnh cảm xúc được; bỏ file để quay lại giọng máy.
          </>
        ) : isClone ? (
          <>
            <br />
            Phần này đang đọc bằng giọng nhân bản của bạn nên chưa chỉnh được cảm xúc.
          </>
        ) : isEleven ? (
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

export function MusicTab({ boot, job }) {
  const pending = useEditorStore((s) => s.pendingMusic);
  const live = useEditorStore((s) => s.liveMusic);
  const actions = useStudioActions();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const defaults = boot?.settings_defaults || {};
  const tracks = boot?.music || [];
  const trackId = live?.track ?? job?.settings?.music_track ?? pending?.track ?? defaults.music_track ?? "default";
  const volume = live?.volume ?? job?.settings?.music_volume ?? pending?.volume ?? defaults.music_volume ?? 0.32;
  const [vol, setVol] = useState(volume);
  useEffect(() => setVol(volume), [volume]);
  const locked = uploading;
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? tracks.filter((t) => `${t.name} ${t.id}`.toLowerCase().includes(needle))
    : tracks;

  const hear = (track, volume) => setUi({ liveMusic: { track, volume } });
  const pick = (id) => {
    hear(id, vol);
    if (job) actions.settings({ music_track: id });
    else setUi({ pendingMusic: { track: id, volume: vol } });
  };
  const committedVol = job?.settings?.music_volume ?? pending?.volume ?? defaults.music_volume ?? 0.32;
  const commitVolume = () => {
    if (Math.abs(vol - committedVol) < 0.001) return;
    if (job) actions.settings({ music_volume: vol });
    else setUi({ pendingMusic: { track: trackId, volume: vol } });
  };
  const addFile = async (file) => {
    setUploading(true);
    setError("");
    try {
      const track = await api.musicUpload(file);
      await queryClient.invalidateQueries({ queryKey: ["studio", "bootstrap"] });
      pick(track.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="part-head">
        <h3>Nhạc nền cả video</h3>
      </div>
      <p className="hint" style={{ margin: "8px 0 12px" }}>
        Nhạc chạy đến trước outro rồi fade tắt — outro giữ tiếng gốc, không còn nhạc nền.
        Tự hạ nhẹ khi có giọng đọc. Thả thanh âm lượng là mix lại tiếng (giữ nguyên hình) — 0% tắt nhạc nền, giọng đọc vẫn còn.
        {job ? "" : " Chọn trước cũng được — gắn vào lúc dựng."}
        File tải lên nằm trên volume, không ghi database.
      </p>
      <div className="chips" style={{ margin: "0 0 10px" }}>
        <PickFile label={uploading ? "Đang tải bài…" : "Tải bài từ máy"} disabled={locked} onPick={addFile} />
      </div>
      {error ? <p className="hint" style={{ color: "#e66767" }}>{error}</p> : null}
      <div className="field">
        Âm lượng
        <div className="range-row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={vol}
            disabled={locked}
            onInput={(e) => {
              const next = Number(e.target.value);
              setVol(next);
              hear(trackId, next);
            }}
            onChange={(e) => {
              const next = Number(e.target.value);
              setVol(next);
              hear(trackId, next);
            }}
            onPointerUp={commitVolume}
            onPointerCancel={commitVolume}
            onKeyUp={commitVolume}
          />
          <output>{Math.round(vol * 100)}%</output>
        </div>
      </div>
      <input
        type="search"
        placeholder="Tìm bài…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: "100%", margin: "10px 0 8px" }}
      />
      <div className="opt-list">
        {shown.map((t) => (
          <button
            key={t.id}
            className={`opt${trackId === t.id ? " on" : ""}`}
            disabled={locked}
            onClick={() => pick(t.id)}
          >
            <b>{t.name}</b>
            <small>{t.duration ? `${t.duration}s` : ""}</small>
          </button>
        ))}
      </div>
      {!shown.length ? <p className="hint">Không có bài khớp.</p> : null}
    </>
  );
}
