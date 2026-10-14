// Library tab "Kịch bản": the build form plus the project summary.
import { useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { money } from "@/lib/formatHelpers";

function summaryRows(job) {
  const t = job.totals;
  const c = job.costs || {};
  const per = (t.gen_cost_usd || 0) + (c.vo?.est_cost_usd || 0) + (c.script_llm || 0);
  return [
    ["Thời lượng", `${t.duration.toFixed(1)}s · ${job.parts.length} phần`],
    ["Shot footage thật / AI", `${t.real_shots} / ${t.gen_shots}`],
    ["Template · planner", `${job.template_id} · ${job.planner}`],
    ["AI generate (đề xuất)", money(t.gen_cost_usd)],
    ["Lồng tiếng (ElevenLabs)", money(c.vo?.est_cost_usd)],
    ["Lập kế hoạch (LLM)", money(c.script_llm)],
    ["Chi phí AI / video", money(per)],
  ];
}

export default function ScriptTab({ boot, job }) {
  const busy = useEditorStore((s) => s.busy);
  const actions = useStudioActions();
  const first = boot.samples[0];
  const [sampleId, setSampleId] = useState(first?.id ?? "");
  const [script, setScript] = useState(first?.script ?? "");
  const [sku, setSku] = useState(first?.sku || "");
  const [templateId, setTemplateId] = useState(first?.template_id || "auto");
  const [planner, setPlanner] = useState("rules");

  const applySample = (id) => {
    const s = boot.samples.find((x) => x.id === id);
    setSampleId(id);
    if (!s) return;
    setScript(s.script);
    setSku(s.sku || "");
    setTemplateId(s.template_id || "auto");
  };

  const product = boot.products.find((x) => x.sku === sku);

  return (
    <>
      <div className="sec">
        <div className="sec-title">Kịch bản</div>
        <label className="field">
          Kịch bản mẫu{" "}
          <select value={sampleId} onChange={(e) => applySample(e.target.value)}>
            {boot.samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <textarea rows="10" placeholder="Dán kịch bản…" value={script} onChange={(e) => setScript(e.target.value)} />
        <label className="field">
          Bộ footage sản phẩm{" "}
          <select value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">— Không gắn sản phẩm (video kiến thức) —</option>
            {boot.products.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} · {p.name.replace(/-/g, " ")} ({p.clips} clip)
              </option>
            ))}
          </select>
        </label>
        <div className="hint">
          {product
            ? `Công đoạn có footage: ${product.step_labels.join(" → ")}${product.has_final ? "" : " · chưa có cảnh hoàn thiện"}`
            : ""}
        </div>
        <label className="field">
          Template{" "}
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="auto">Tự động</option>
            {boot.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Planner{" "}
          <select value={planner} onChange={(e) => setPlanner(e.target.value)}>
            <option value="rules">Quy tắc offline</option>
            <option value="claude" disabled={!boot.claude_available}>
              Claude Opus 5.5 {boot.claude_available ? "" : "(cần API key)"}
            </option>
          </select>
        </label>
        <button
          className="primary"
          disabled={!!busy}
          onClick={() => actions.build({ script, sku, template_id: templateId, planner })}
        >
          ▶ Dựng video
        </button>
      </div>
      <div className="sec">
        <div className="sec-title">Tổng quan dự án</div>
        <div className="hint">
          {job
            ? summaryRows(job).map(([k, v]) => (
                <div key={k} className="stat">
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))
            : "Chưa có dự án."}
        </div>
      </div>
    </>
  );
}
