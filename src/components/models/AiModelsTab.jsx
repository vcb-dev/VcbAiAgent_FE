// "So sánh model AI" tab: real benchmark results + per-activity model picker + monthly cost calculator.
import { useEffect, useRef, useState } from "react";
import { useAiModels } from "@/features/studio/useStudio";
import { money } from "@/lib/formatHelpers";

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const PER_LANG = { tts: 1, asr: 1, avatar_video: 1 }; // multiplied by number of languages

/** Number input that commits on the native `change` event (blur / Enter), like the legacy wiring. */
function CommitNumber({ value, onCommit, ...rest }) {
  const ref = useRef(null);
  const handler = useRef(onCommit);
  handler.current = onCommit;
  useEffect(() => {
    const el = ref.current;
    const commit = () => handler.current(Number(el.value) || 0);
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, []);
  return <input ref={ref} type="number" defaultValue={value} {...rest} />;
}

function BenchmarkCard({ bench }) {
  const blind = bench.planning_blind?.per_model || {};
  const rows = ["haiku", "sonnet", "opus"].map((m) => {
    const r = bench.models?.[m];
    if (!r) return null;
    const t = r.tagging;
    const rs = r.run_stats || {};
    return (
      <tr key={m}>
        <td>
          <b>{r.model_id}</b>
        </td>
        <td>{pct(t.role_acc)}</td>
        <td>{pct(t.craft_step_acc)}</td>
        <td>{pct(t.craft_step_within_1)}</td>
        <td>{pct(t.huyk_acc)}</td>
        <td>{pct(t.watermark_logo_acc)}</td>
        <td>{r.planning_avg_score}%</td>
        <td>
          <b>{blind[m]?.avg_overall ?? "—"}</b>/10
        </td>
        <td>{money(t.api_cost_per_1000_clips_usd)}</td>
        <td>{money(r.api_cost_per_1000_scripts_usd)}</td>
        <td>
          {Math.round((rs.tagging?.duration_ms || 0) / 1000)}s / {Math.round((rs.planning?.duration_ms || 0) / 1000)}s
        </td>
      </tr>
    );
  });
  return (
    <div className="panel">
      <h3>Kết quả test thực tế ({bench.date || ""}) — Claude Haiku / Sonnet / Opus 5.5</h3>
      <p className="hint">
        T1 gắn nhãn 12 clip có đáp án, chỉ nhìn contact sheet (không gợi ý tên file). T2 lập kế hoạch 3 kịch bản thật: 6 kiểm tra quy tắc + giám khảo mù (Opus, xáo nhãn). Chi phí API tính theo bảng giá công bố với cùng giả định token.
      </p>
      <table className="opt-table">
        <tbody>
          <tr>
            <th>Model</th>
            <th>Vai trò</th>
            <th>Công đoạn</th>
            <th>±1 bước</th>
            <th>HuyK</th>
            <th>Logo/WM</th>
            <th>Quy tắc KH</th>
            <th>Giám khảo</th>
            <th>$/1k clip</th>
            <th>$/1k KB</th>
            <th>Thời gian T1/T2</th>
          </tr>
          {rows}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: "8px" }}>
        Gemini, GPT, ElevenLabs, HeyGen, Veo, Seedance: chưa test thực tế vì chưa có API key — bảng dưới dùng giá công bố (đã kiểm tra trên trang nhà cung cấp, có link nguồn).
      </p>
    </div>
  );
}

function ActivityCard({ pricing, activityKey, act, picks, onPick }) {
  const opts = pricing.options.filter((o) => o.activity === activityKey);
  const max = Math.max(...opts.map((o) => o.cost_per_unit_usd || 0), 1e-9);
  return (
    <div className="panel">
      <h3>{act.label}</h3>
      <span className="hint">
        Chi phí trên 1 {act.per} · giả định lượng dùng: {JSON.stringify(act.usage)}
      </span>
      <table className="opt-table">
        <tbody>
          <tr>
            <th />
            <th>Model</th>
            <th>Hạng</th>
            <th>{`$/${act.per}`}</th>
            <th>So sánh</th>
            <th />
            <th />
          </tr>
          {opts.map((o) => (
            <tr key={o.id} className={picks[activityKey] === o.id ? "chosen" : ""}>
              <td>
                <input
                  type="radio"
                  name={activityKey}
                  value={o.id}
                  checked={picks[activityKey] === o.id}
                  onChange={() => onPick(activityKey, o.id)}
                />
              </td>
              <td>
                <b>{o.model.split(" (")[0]}</b>
                {o.recommended ? " ★" : ""}
                <br />
                <span className="hint">{o.provider}</span>
              </td>
              <td>
                <span className="tier">{o.tier}</span>
              </td>
              <td style={{ fontFamily: "var(--mono)" }}>{money(o.cost_per_unit_usd)}</td>
              <td style={{ width: "22%" }}>
                <div className="bar" title={`${money(o.cost_per_unit_usd)} / ${act.per}`}>
                  <i style={{ width: `${(100 * (o.cost_per_unit_usd || 0)) / max}%` }} />
                </div>
              </td>
              <td>
                {o.tested_in_benchmark ? <span className="chip ok">đã test</span> : ""}{" "}
                {o.verified_price ? "" : <span className="chip warn">giá chưa xác minh</span>}
              </td>
              <td>
                {o.source_url ? (
                  <a href={o.source_url} target="_blank" rel="noopener">
                    nguồn
                  </a>
                ) : (
                  ""
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function costBreakdown(pricing, picks, inputs) {
  const L = inputs.langs;
  const V = Math.max(inputs.videos, 1);
  const items = Object.entries(pricing.activities)
    .map(([key, act]) => {
      const o = pricing.options.find((x) => x.id === picks[key]) || {};
      let perVideo = o.cost_per_unit_usd || 0;
      if (key === "vision_tagging") perVideo = (perVideo * inputs.clips) / V; // amortised over the month's videos
      else if (PER_LANG[key]) perVideo *= L;
      else if (key === "script_llm") perVideo *= 1 + 0.5 * (L - 1); // master plan + adaptation per language
      return { key, label: act.label, model: o.model || "", perVideo };
    })
    .sort((a, b) => b.perVideo - a.perVideo);
  return { items, total: items.reduce((s, i) => s + i.perVideo, 0) };
}

function SummaryCard({ pricing, picks, inputs, setInput, onPreset }) {
  const { items, total } = costBreakdown(pricing, picks, inputs);
  const max = Math.max(...items.map((i) => i.perVideo), 1e-9);
  const monthly = total * inputs.videos;
  const vnd = (usd) => `${Math.round(usd * inputs.fx).toLocaleString("vi-VN")}đ`;
  return (
    <div className="panel sticky">
      <h3>Chi phí AI ước tính</h3>
      <label>
        Số video / tháng{" "}
        <CommitNumber key={inputs.videos} min="100" step="500" value={inputs.videos} onCommit={setInput("videos")} />
      </label>
      <label>
        Số ngôn ngữ / video (VN, TH, JP, EN){" "}
        <CommitNumber key={inputs.langs} min="1" max="4" value={inputs.langs} onCommit={setInput("langs")} />
      </label>
      <label>
        Clip footage mới / tháng (gắn nhãn){" "}
        <CommitNumber key={inputs.clips} min="0" step="500" value={inputs.clips} onCommit={setInput("clips")} />
      </label>
      <label>
        Tỷ giá giả định (đ/USD){" "}
        <CommitNumber key={inputs.fx} min="1000" step="100" value={inputs.fx} onCommit={setInput("fx")} />
      </label>
      <div className="sec-title">Mỗi video</div>
      <div className="big">{money(total)}</div>
      <div className="hint">≈ {vnd(total)} / video</div>
      <div className="sec-title">Mỗi tháng</div>
      <div className="big">{money(monthly)}</div>
      <div className="hint">
        ≈ {vnd(monthly)} cho {inputs.videos.toLocaleString("vi-VN")} video × {inputs.langs} ngôn ngữ
      </div>
      <div className="sec-title">Phân bổ theo hoạt động (mỗi video)</div>
      {items.map((i) => (
        <div key={i.key} style={{ margin: "6px 0" }} title={i.model}>
          <div className="stat" style={{ border: "0", padding: "0" }}>
            <span>{i.label}</span>
            <b>{money(i.perVideo)}</b>
          </div>
          <div className="bar">
            <i style={{ width: `${(100 * i.perVideo) / max}%` }} />
          </div>
        </div>
      ))}
      <div className="row" style={{ display: "flex", gap: "6px", marginTop: "12px", flexWrap: "wrap" }}>
        <button className="small-btn" onClick={() => onPreset("rẻ")}>
          Chọn rẻ nhất
        </button>
        <button className="small-btn" onClick={() => onPreset("rec")}>
          Chọn đề xuất ★
        </button>
        <button className="small-btn" onClick={() => onPreset("cao cấp")}>
          Chọn cao cấp
        </button>
      </div>
      <p className="hint" style={{ marginTop: "10px" }}>
        Chưa gồm hạ tầng render, lưu trữ, nhân sự. Giá kiểm tra {pricing.checked_date}; một số giá có khuyến mãi/tăng theo ngày (xem nguồn).
      </p>
    </div>
  );
}

function preset(pricing, kind) {
  const picks = {};
  for (const key of Object.keys(pricing.activities)) {
    const opts = pricing.options.filter((o) => o.activity === key);
    const pick =
      kind === "rec"
        ? opts.find((o) => o.recommended)
        : kind === "rẻ"
          ? [...opts].sort((a, b) => (a.cost_per_unit_usd || 0) - (b.cost_per_unit_usd || 0))[0]
          : opts.filter((o) => o.tier === "cao cấp").sort((a, b) => (b.cost_per_unit_usd || 0) - (a.cost_per_unit_usd || 0))[0] || opts[0];
    if (pick) picks[key] = pick.id;
  }
  return picks;
}

function ModelsPage({ pricing, bench }) {
  const [picks, setPicks] = useState(() => preset(pricing, "rec"));
  const [inputs, setInputs] = useState({ videos: 10000, langs: 4, clips: 3000, fx: 26000 });

  const setInput = (k) => (value) => setInputs((prev) => ({ ...prev, [k]: Math.max(value, k === "langs" ? 1 : 0) }));

  return (
    <>
      <div>
        <BenchmarkCard bench={bench} />
        {Object.entries(pricing.activities).map(([k, a]) => (
          <ActivityCard
            key={k}
            pricing={pricing}
            activityKey={k}
            act={a}
            picks={picks}
            onPick={(key, id) => setPicks((prev) => ({ ...prev, [key]: id }))}
          />
        ))}
      </div>
      <SummaryCard
        pricing={pricing}
        picks={picks}
        inputs={inputs}
        setInput={setInput}
        onPreset={(kind) => setPicks((prev) => ({ ...prev, ...preset(pricing, kind) }))}
      />
    </>
  );
}

export default function AiModelsTab() {
  const { data } = useAiModels();
  if (!data) return null;
  return <ModelsPage pricing={data.pricing} bench={data.benchmark || {}} />;
}
