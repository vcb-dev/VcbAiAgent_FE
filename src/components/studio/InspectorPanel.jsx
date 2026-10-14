// Right pane (CapCut "properties"): tabs Cảnh | Giọng | Tốc độ & khung for the selected part/shot.
import { useState } from "react";
import { currentPart, currentShot, setUi, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { fmtTime, media, money, GEN_LABEL, STATUS_CHIP, STATUS_LABEL } from "@/lib/formatHelpers";
import { SpeedTab, VoiceTab } from "./InspectorVoiceSpeed";

const TABS = [["scene", "Cảnh"], ["voice", "Giọng"], ["speed", "Tốc độ & khung"]];
const SCOPE_BADGE = { product: "ĐÚNG SKU", shared: "CHUNG VCB", collected: "SƯU TẦM" };

function ClipCard({ job, cand, selectedId, onPick }) {
  const [hover, setHover] = useState(false);
  const clip = job.clips[cand.clip_id] || {};
  return (
    <div
      className={`card${cand.clip_id === selectedId ? " selected" : ""}`}
      title={clip.description_vi || ""}
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="badge">{cand.manual ? "THỦ CÔNG" : SCOPE_BADGE[cand.scope] || ""}</span>
      {hover ? (
        // hover preview: play the proxy from its best moment
        <video className="thumb" src={`${media(clip.proxy)}#t=${clip.best_moment_s || 0}`} muted autoPlay loop playsInline />
      ) : (
        <img className="thumb" src={media(clip.thumb)} alt="" />
      )}
      <div className="meta">
        <b>{clip.name || ""}</b>
        <div className="score">
          <i style={{ width: `${Math.round(Math.min(cand.score, 1) * 100)}%` }} />
        </div>
        {cand.reason}
      </div>
    </div>
  );
}

function GenCard({ gen, selected, busy, onUse }) {
  const shoot = gen.type === "shoot_request";
  return (
    <div className={`gen-card${shoot ? " shoot" : ""}`}>
      <div className="row">
        <b>{GEN_LABEL[gen.type] || gen.type}</b>
        <span className={`chip ${shoot ? "warn" : "ai"}`}>{shoot ? "0đ" : "≈ " + money(gen.est_cost_usd)}</span>
      </div>
      <p>
        {gen.provider} · {gen.duration}s
      </p>
      <p>{gen.prompt}</p>
      <div className="guard">⚑ {gen.guardrail}</div>
      <div className="row" style={{ marginTop: "7px" }}>
        <span />
        <button className="small-btn" disabled={!!busy} onClick={onUse}>
          {selected ? "✓ Đang dùng" : shoot ? "Dùng khung phiếu quay" : "Dùng phương án AI"}
        </button>
      </div>
    </div>
  );
}

function CurrentBlock({ job, part, shot }) {
  const sel = shot.selected;
  if (sel.kind !== "clip") {
    const gen = (part.gen_options || []).find((g) => g.gen_id === sel.gen_id);
    return (
      <div className="gen-card">
        <b>{GEN_LABEL[gen?.type] || "Thiếu footage"}</b>
        <p>Trong video hiển thị khung chờ ghi rõ prompt &amp; chi phí; production sẽ gọi API generate.</p>
      </div>
    );
  }
  const clip = job.clips[sel.clip_id] || {};
  const end = sel.src_in + shot.duration * sel.speed;
  return (
    <div className="current">
      {/* keep the poster until a real frame is decoded (no black box) */}
      <video
        src={`${media(clip.proxy)}#t=${sel.src_in},${end.toFixed(2)}`}
        poster={media(clip.thumb)}
        preload="auto"
        muted
        loop
        playsInline
        onLoadedData={(e) => e.currentTarget.play().catch(() => {})}
      />
      <div className="hint">
        <b style={{ color: "var(--ink)" }}>{clip.name}</b>
        <br />
        Nguồn {sel.src_in.toFixed(1)}s → {end.toFixed(1)}s · {sel.speed}×{sel.zoom ? ` · zoom ${sel.zoom}×` : ""}
        <br />
        {clip.folder} · {clip.product_set || "footage chung"}
        <br />
        <i>{clip.description_vi || ""}</i>
      </div>
    </div>
  );
}

function SceneTab({ job, part, shot }) {
  const busy = useEditorStore((s) => s.busy);
  const actions = useStudioActions();
  const selClip = shot.selected.kind === "clip" ? shot.selected.clip_id : null;
  const selGen = shot.selected.kind === "gen" ? shot.selected.gen_id : null;
  const candidates = part.candidates || [];
  const gens = part.gen_options || [];

  return (
    <>
      <div className="part-head">
        <h3>
          {part.role_label}
          {part.craft_step ? " · " + part.craft_step.replace(/_/g, " ") : ""}
        </h3>
        <span className={`chip ${STATUS_CHIP[part.status] || ""}`}>{STATUS_LABEL[part.status] || part.status}</span>
      </div>
      <div className="hint">
        {part.part_id.toUpperCase()} · {fmtTime(part.start)} → {fmtTime(part.start + part.duration)} (
        {part.duration.toFixed(1)}s)
        {part.alt_roles?.length ? ` · "X" thay thế: ${part.alt_roles.join(", ")}` : ""}
      </div>
      {part.vo_text ? <div className="vo">{part.vo_text}</div> : ""}
      {part.shots.length > 1 ? (
        <div className="chips" style={{ marginTop: "8px" }}>
          {part.shots.map((s) => (
            <button
              key={s.index}
              className={`small-btn ${s.index === shot.index ? "on" : ""}`}
              onClick={() => setUi({ sel: { part: part.part_id, shot: s.index } })}
            >
              Shot {s.index + 1}
            </button>
          ))}
        </div>
      ) : (
        ""
      )}
      <div className="sec-title" style={{ marginTop: "12px" }}>
        Đang dùng · shot {shot.index + 1}/{part.shots.length}
      </div>
      <CurrentBlock job={job} part={part} shot={shot} />
      <div className="sec-title" style={{ marginTop: "14px" }}>
        Phương án footage thay thế ({candidates.length}) <span className="hint">rê chuột để xem</span>
      </div>
      <div className="cards">
        {candidates.length ? (
          candidates.map((c) => (
            <ClipCard
              key={c.clip_id}
              job={job}
              cand={c}
              selectedId={selClip}
              onPick={() => !busy && actions.choose(part.part_id, shot.index, { kind: "clip", clip_id: c.clip_id })}
            />
          ))
        ) : (
          <p className="hint">Kho chưa có footage phù hợp — xem đề xuất bên dưới hoặc chọn từ tab Footage.</p>
        )}
      </div>
      <div className="sec-title" style={{ marginTop: "14px" }}>
        Đề xuất generate / bổ sung
      </div>
      {gens.length ? (
        gens.map((g) => (
          <GenCard
            key={g.gen_id}
            gen={g}
            selected={g.gen_id === selGen}
            busy={busy}
            onUse={() => actions.choose(part.part_id, shot.index, { kind: "gen", gen_id: g.gen_id })}
          />
        ))
      ) : (
        <p className="hint">Không cần — phần này dùng footage thư viện.</p>
      )}
    </>
  );
}

export default function InspectorPanel({ boot, job }) {
  const sel = useEditorStore((s) => s.sel);
  const inspTab = useEditorStore((s) => s.inspTab);
  const part = currentPart(job, sel);
  const shot = currentShot(job, sel);
  const ready = !!job && !!part && !!shot;
  const revision = job?.render?.revision;

  return (
    <section className="pane inspector">
      <nav className="insp-tabs">
        {boot &&
          TABS.map(([id, label]) => (
            <button
              key={id}
              className={`insp-tab${inspTab === id ? " active" : ""}`}
              onClick={() => setUi({ inspTab: id })}
            >
              {label}
            </button>
          ))}
      </nav>
      <div className="insp-body">
        {!ready ? (
          <p className="muted pad">Chọn một khối trên timeline để chỉnh.</p>
        ) : inspTab === "scene" ? (
          <SceneTab job={job} part={part} shot={shot} />
        ) : inspTab === "voice" ? (
          <VoiceTab key={`${part.part_id}|${revision}`} boot={boot} part={part} />
        ) : (
          <SpeedTab key={`${part.part_id}|${shot.index}|${revision}`} job={job} part={part} shot={shot} />
        )}
      </div>
    </section>
  );
}
