// Left-pane option tabs bound to job settings: Âm thanh, Văn bản, Hiệu ứng, AI.
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { money, GEN_LABEL } from "@/lib/formatHelpers";

const cfg = (boot, job) => ({ ...boot.settings_defaults, ...(job?.settings || {}) });
const useLocked = (job) => {
  const busy = useEditorStore((s) => s.busy);
  return !job || !!busy;
};

function Opt({ boot, job, settingKey, value, title, sub }) {
  const actions = useStudioActions();
  const locked = useLocked(job);
  const on = cfg(boot, job)[settingKey] === value ? " on" : "";
  return (
    <button
      className={`opt${on}`}
      disabled={locked}
      onClick={() => actions.settings({ [settingKey]: value })}
    >
      <b>{title}</b>
      <small>{sub || ""}</small>
    </button>
  );
}

function Toggle({ boot, job, settingKey, label, sub }) {
  const actions = useStudioActions();
  const locked = useLocked(job);
  const value = cfg(boot, job)[settingKey];
  return (
    <div className="toggle">
      <span>
        {label}
        <br />
        <small className="hint">{sub}</small>
      </span>
      <button
        className={`switch ${value ? "on" : ""}`}
        disabled={locked}
        aria-label={label}
        onClick={() => actions.settings({ [settingKey]: !value })}
      />
    </div>
  );
}

/**
 * Range bound to a job setting. Commits on the native `change` event (pointer release),
 * like the legacy wiring — React's onChange would fire on every drag step.
 */
function SettingRange({ settingKey, value, disabled, ...rest }) {
  const ref = useRef(null);
  const actions = useStudioActions();
  useEffect(() => {
    const el = ref.current;
    const commit = () => actions.settings({ [settingKey]: Number(el.value) });
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, [actions, settingKey]);
  return <input ref={ref} type="range" defaultValue={value} disabled={disabled} {...rest} />;
}

export function AudioTab({ boot, job }) {
  const c = cfg(boot, job);
  const locked = useLocked(job);
  return (
    <>
      <div className="sec">
        <div className="sec-title">Giọng đọc (VO)</div>
        <div className="opt-grid">
          <Opt boot={boot} job={job} settingKey="voice" value="huyk" title="Giọng HuyK"
            sub={boot.eleven_available ? "ElevenLabs clone · eleven_v4"
              : boot.huyk_voice_available ? "giọng nhân bản · MiniMax" : "chưa học giọng"} />
          <Opt boot={boot} job={job} settingKey="voice" value="demo" title="Giọng demo" sub="macOS “Linh” · offline" />
        </div>
        <p className="hint" style={{ marginTop: "6px" }}>
          Cảm xúc từng câu chỉnh ở panel phải → tab <b>Giọng</b>.
        </p>
      </div>
      <div className="sec">
        <div className="sec-title">Nhạc nền</div>
        <div className="opt-list">
          {boot.music.map((t) => (
            <Opt key={t.id} boot={boot} job={job} settingKey="music_track" value={t.id} title={t.name} sub={`${t.duration}s`} />
          ))}
        </div>
        <p className="hint">
          Bỏ file nhạc bản quyền vào <code>mvp/data/music/</code> để thêm lựa chọn.
        </p>
        <div className="field">
          Âm lượng nhạc (tự hạ khi có giọng)
          <div className="range-row">
            <SettingRange key={c.music_volume} settingKey="music_volume" min="0" max="0.8" step="0.02"
              value={c.music_volume} disabled={locked} />
            <output>{Math.round(c.music_volume * 100)}%</output>
          </div>
        </div>
      </div>
      <div className="sec">
        <div className="sec-title">Hiệu ứng âm thanh</div>
        <Toggle boot={boot} job={job} settingKey="sfx" label="SFX theo công đoạn"
          sub="búa ở đập/cán · khò ở nung/hàn · lấp lánh ở cảnh hoàn thiện" />
      </div>
    </>
  );
}

export function TextTab({ boot, job }) {
  return (
    <>
      <div className="sec">
        <div className="sec-title">Phụ đề theo lời đọc</div>
        <Toggle boot={boot} job={job} settingKey="subtitles" label="Hiện phụ đề" sub="tự chia 8 từ / dòng theo nhịp giọng" />
        <div className="opt-grid" style={{ marginTop: "8px" }}>
          <Opt boot={boot} job={job} settingKey="subtitle_style" value="box" title="Hộp nền" sub="giống project CapCut mẫu" />
          <Opt boot={boot} job={job} settingKey="subtitle_style" value="outline" title="Viền chữ" sub="chữ đậm, không nền" />
        </div>
      </div>
      <div className="sec">
        <div className="sec-title">Chữ hook (0–5s)</div>
        <Toggle boot={boot} job={job} settingKey="hook_text" label="Hiện câu hook đầu video"
          sub="8 từ đầu của kịch bản, chữ vàng phía trên" />
      </div>
    </>
  );
}

export function EffectsTab({ boot, job }) {
  return (
    <>
      <div className="sec">
        <div className="sec-title">Chuyển cảnh giữa các phần</div>
        <div className="opt-grid">
          <Opt boot={boot} job={job} settingKey="transition" value="cut" title="Cắt thẳng" sub="nhịp nhanh" />
          <Opt boot={boot} job={job} settingKey="transition" value="dip" title="Mờ qua đen" sub="0,18s mỗi biên" />
        </div>
      </div>
      <div className="sec">
        <div className="sec-title">Bộ lọc màu</div>
        <div className="opt-grid">
          <Opt boot={boot} job={job} settingKey="color" value="none" title="Gốc" sub="không chỉnh" />
          <Opt boot={boot} job={job} settingKey="color" value="warm" title="Trang sức ấm" sub="vàng, đá ấm" />
          <Opt boot={boot} job={job} settingKey="color" value="cool" title="Bạc lạnh" sub="bạc, đá xanh" />
        </div>
      </div>
    </>
  );
}

export function AiTab({ job }) {
  const actions = useStudioActions();
  const locked = useLocked(job);
  if (!job) return <p className="hint">Dựng video để xem các đề xuất AI.</p>;
  const rows = job.parts
    .filter((p) => (p.gen_options || []).length)
    .map((p) => {
      const active = p.shots.some((sh) => sh.selected.kind === "gen");
      return (
        <div key={p.part_id} className={`gen-card${active ? "" : " shoot"}`}>
          <div className="row">
            <b>
              {p.part_id.toUpperCase()} · {p.role_label}
            </b>
            <span className={`chip ${active ? "ai" : ""}`}>{active ? "đang dùng AI" : "footage thật"}</span>
          </div>
          {p.gen_options.map((g) => (
            <div key={g.gen_id} className="row" style={{ marginTop: "6px" }}>
              <span>
                {GEN_LABEL[g.type] || g.type} · {g.type === "shoot_request" ? "0đ" : money(g.est_cost_usd)}
              </span>
              <button
                className="small-btn"
                disabled={locked}
                onClick={() => actions.choose(p.part_id, 0, { kind: "gen", gen_id: g.gen_id })}
              >
                Dùng
              </button>
            </div>
          ))}
        </div>
      );
    });
  return (
    <div className="sec">
      <div className="sec-title">
        Đề xuất AI generate <span>{money(job.totals.gen_cost_usd)}</span>
      </div>
      <p className="hint" style={{ marginBottom: "8px" }}>
        Agent chỉ đề xuất AI khi kho thiếu cảnh. Không bao giờ sinh quá trình chế tác của SKU (phiếu quay bổ sung).
      </p>
      {rows}
    </div>
  );
}
