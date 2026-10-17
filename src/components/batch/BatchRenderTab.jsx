// Tab "Render hàng loạt": một sản phẩm, một kịch bản, nhiều video khác nhau.
//
// Luồng: chọn sản phẩm → soát xem ổ có đủ nguồn cho từng công đoạn chưa → nhập nội dung →
// chọn giọng HuyK → nhập số video. Mỗi video bốc lại kế hoạch A4 (buổi quay, 4 công đoạn, cảnh
// HuyK) và gửi kèm danh sách clip các video trước đã dùng, nên clip chế tác / HuyK / outro /
// sản phẩm hoàn thiện của mỗi video là riêng.
//
// Chạy lần lượt chứ không song song: một lần dựng đã chiếm gần hết CPU cho ffmpeg, chạy chồng
// nhau chỉ làm mọi video cùng chậm. Video nào lỗi thì ghi lại rồi đi tiếp, không chặn cả lô.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/features/studio/api";
import { nas } from "@/features/nas/api";
import { useBootstrap, useVoices } from "@/features/studio/useStudio";
import { useCategories, useCraftSteps, useHuykActions, useProducts } from "@/features/nas/useNas";
import { media } from "@/lib/formatHelpers";

const CRAFT_SLOTS = 4;      // tuyến A4 cần 4 công đoạn chế tác
const HUYK_SLOTS = 2;       // và 2 cảnh HuyK
const MAX_VIDEOS = 20;
const PLAN_TRIES = 8;       // số lần bốc lại khi kế hoạch trùng với video trước

const STATUS_LABEL = {
  queued: "chờ",
  plan: "đang bốc cảnh",
  prepare: "đang kéo footage từ ổ",
  build: "đang dựng",
  done: "xong",
  error: "lỗi",
  skipped: "đã dừng",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const signature = (plan) => [plan.shoot, ...plan.craft.map((s) => s.path), ...plan.huyk.map((s) => s.path)].join("|");

// Vai mà cả lô không được dùng lại clip của nhau; phải khớp với UNIQUE_ROLES bên VCB_AI.
const UNIQUE_ROLES = new Set(["craft", "huyk_talk", "outro", "product_final"]);

/** Clip của các công đoạn phải khác nhau giữa các video, để video sau né ra. */
function usedClips(job) {
  const roles = new Map((job.parts || []).map((p) => [p.part_id, p.role]));
  return (job.timeline?.shots || [])
    .filter((s) => s.selected.kind === "clip" && UNIQUE_ROLES.has(roles.get(s.part_id)))
    .map((s) => s.selected.clip_id);
}

/** Một dòng trong bảng soát nguồn: đủ thì xanh, thiếu thì đỏ. */
function Check({ ok, label, detail }) {
  return (
    <i className={ok ? "ok" : "miss"}>
      {ok ? "✔" : "✕"} {label}
      <small>{detail}</small>
    </i>
  );
}

export default function BatchRenderTab() {
  const queryClient = useQueryClient();
  const { data: boot } = useBootstrap();
  const categories = useCategories();
  const voices = useVoices();
  const huykActions = useHuykActions();

  const [category, setCategory] = useState("");
  const [sku, setSku] = useState("");
  const [search, setSearch] = useState("");
  const [script, setScript] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [count, setCount] = useState(5);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(0);        // tab video đang xem ở cột phải
  const [running, setRunning] = useState(false);
  const stopped = useRef(false);

  const products = useProducts(category, true);      // chỉ mã đã có footage chế tác trên ổ
  const craftSteps = useCraftSteps(category, sku);
  const product = useMemo(() => (products.data || []).find((p) => p.sku === sku), [products.data, sku]);
  const hasProxy = useMemo(() => (boot?.products || []).some((p) => p.sku === sku), [boot, sku]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.data || [];
    return q ? list.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(q)) : list;
  }, [products.data, search]);

  const steps = craftSteps.data || [];
  const shoots = useMemo(() => new Set(steps.map((s) => s.shoot)).size, [steps]);
  const actions = huykActions.data || [];
  const craftClips = useMemo(() => steps.reduce((n, s) => n + (s.clips || 0), 0), [steps]);
  const huykClips = useMemo(() => actions.reduce((n, a) => n + (a.clips || 0), 0), [actions]);
  // Clip đã kéo về máy: đây mới là kho thực sự dùng được, và là chỗ quyết định mỗi video có
  // bốc được cảnh riêng hay không.
  const pool = useMemo(() => {
    const lib = boot?.library || [];
    const has = (c, role) => c.roles?.includes(role);
    return {
      product: lib.filter((c) => c.product_set === sku && (has(c, "product_final") || has(c, "product_hero"))).length,
      productFinal: lib.filter((c) => c.product_set === sku && has(c, "product_final")).length,
      craft: lib.filter((c) => c.product_set === sku && has(c, "craft")).length,
      huyk: lib.filter((c) => has(c, "huyk_talk")).length,
      outro: lib.filter((c) => has(c, "outro")).length,
    };
  }, [boot, sku]);

  const covered = pool.product > 0 || !!product?.folders?.length;
  // Mỗi video ăn 4 clip chế tác, 2 cảnh HuyK, 1 hoàn thiện và 1 outro riêng — kho nhỏ nhất là trần.
  // Thư mục chưa kéo thì mỗi thư mục còn cho thêm một clip nữa, nên lấy mức cao hơn trong hai.
  const maxDistinct = Math.min(
    Math.floor(Math.max(pool.craft, steps.length) / CRAFT_SLOTS),
    Math.floor(Math.max(pool.huyk, actions.length) / HUYK_SLOTS),
    Math.max(pool.productFinal, pool.product, 1),
    Math.max(pool.outro, 1),
  );

  // Mặc định lấy đúng giọng hệ thống đang dùng cho HuyK.
  useEffect(() => {
    if (!voiceId) setVoiceId(voices.data?.find((v) => v.default)?.voice_id || "");
  }, [voices.data]);     // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!sku && script.trim().length >= 10 && count >= 1 && !craftSteps.isLoading;

  /** Bốc kế hoạch A4 khác với các video đã dựng trong lô; hết cách thì chấp nhận trùng. */
  const freshPlan = async (seen) => {
    let plan = null;
    for (let i = 0; i < PLAN_TRIES; i += 1) {
      plan = await nas.a4Plan(category, sku);
      if (!plan?.craft?.length) throw new Error("chưa có source chế tác trên ổ");
      if (!seen.has(signature(plan))) break;
    }
    seen.add(signature(plan));
    return plan;
  };

  /** Một video: bốc cảnh A4 → kéo footage còn thiếu → dựng → chờ render xong. */
  const renderOne = async (index, seen, taken) => {
    const set = (patch) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

    set({ status: "plan", error: "" });
    const plan = await freshPlan(seen);
    set({ status: "prepare", shoot: plan.shoot, craft: plan.craft.map((s) => s.name) });
    try {
      await nas.prepare(category, sku, {
        craft: plan.craft.map((s) => s.path),
        huyk: plan.huyk.map((s) => s.path),
      });
    } catch (err) {
      // Mất ổ giữa chừng mà máy đã có proxy thì vẫn dựng được, chỉ là bốc trong kho sẵn có.
      if (!hasProxy) throw err;
    }

    set({ status: "build" });
    let job = await api.createJob({
      script,
      sku,
      template_id: "A4_v1",
      planner: "rules",
      voice_id: voiceId,
      variant: index + 1,        // mỗi video một số biến thể để không bốc trùng cảnh
      exclude_clips: [...taken],  // clip các video trước đã dùng, video này phải tránh ra
      plan: {
        category,
        shoot: plan.shoot,
        craft: plan.craft.map((s) => ({ path: s.path, name: s.name, step: s.step })),
        huyk: plan.huyk.map((s) => ({ path: s.path, name: s.name })),
      },
    });
    while (job?.render?.status === "rendering") {
      await sleep(900);
      job = await api.getJob(job.id);
    }
    if (job?.render?.status !== "done") throw new Error(job?.render?.error || "dựng thất bại");
    usedClips(job).forEach((id) => taken.add(id));

    set({
      status: "done",
      jobId: job.id,
      url: job.render.url,
      poster: job.render.poster ? media(job.render.poster) : undefined,
      seconds: job.render.seconds,
      duration: job.totals?.duration,
      clips: job.timeline?.shots?.filter((s) => s.selected.kind === "clip").length,
    });
  };

  const runAll = async () => {
    stopped.current = false;
    setRunning(true);
    setRows(Array.from({ length: count }, () => ({ status: "queued" })));
    setPreview(0);
    const seen = new Set();
    const taken = new Set();
    for (let i = 0; i < count; i += 1) {
      if (stopped.current) {
        setRows((list) => list.map((r, idx) => (idx === i ? { status: "skipped" } : r)));
        continue;
      }
      try {
        await renderOne(i, seen, taken);
      } catch (err) {
        setRows((list) => list.map((r, idx) => (idx === i ? { ...r, status: "error", error: err.message } : r)));
      }
    }
    queryClient.invalidateQueries({ queryKey: ["studio", "bootstrap"] });
    setRunning(false);
  };

  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "error").length;
  const shown = rows[preview];

  // Đang dựng thì tự nhảy sang video vừa xong, trừ khi người dùng đang mở một video khác.
  useEffect(() => {
    const lastDone = rows.reduce((found, r, i) => (r.status === "done" ? i : found), -1);
    if (lastDone >= 0 && rows[preview]?.status !== "done") setPreview(lastDone);
  }, [rows]);     // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
    <div className="batch">
      <div className="panel">
        <h3>1 · Chọn sản phẩm</h3>
        <div className="chips" style={{ marginTop: 8 }}>
          {(categories.data || []).map((c) => (
            <button
              key={c.code}
              className={`small-btn${category === c.code ? " on" : ""}`}
              disabled={running}
              onClick={() => {
                setCategory(c.code);
                setSku("");
                setSearch("");
              }}
            >
              {c.label} ({c.ready ?? c.products})
            </button>
          ))}
        </div>
        {categories.isError && <div className="hint">Không đọc được kho: {categories.error.message}</div>}

        {category && (
          <>
            <input
              placeholder="Tìm theo mã hoặc tên…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", margin: "8px 0 6px" }}
            />
            <div className="hint" style={{ margin: "4px 0 6px" }}>
              Chỉ hiện mã đã có footage chế tác trên ổ — {visible.length} mã trong loại này.
            </div>
            <div className="pick-list">
              {visible.map((p) => (
                <label key={p.sku} className={`pick${sku === p.sku ? " on" : ""}`}>
                  <input
                    type="radio"
                    name="batch-sku"
                    checked={sku === p.sku}
                    disabled={running}
                    onChange={() => setSku(p.sku)}
                  />
                  <b>{p.sku}</b>
                  <span>{p.name}</span>
                  <small>{(boot?.products || []).some((b) => b.sku === p.sku) ? "● có proxy" : "○ kéo khi dựng"}</small>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {sku && (
        <div className="panel">
          <h3>2 · Soát nguồn của {sku}</h3>
          {craftSteps.isLoading ? (
            <div className="hint">Đang đọc kho công đoạn của mã này…</div>
          ) : craftSteps.isError ? (
            <div className="hint">Không đọc được công đoạn: {craftSteps.error.message}</div>
          ) : (
            <>
              <div className="cover">
                <Check
                  ok={covered}
                  label="Sản phẩm hoàn thiện"
                  detail={`${pool.product} clip đã kéo · ${product?.folders?.length || 0} thư mục trên ổ`}
                />
                <Check
                  ok={Math.max(pool.craft, steps.length) >= CRAFT_SLOTS}
                  label="Chế tác"
                  detail={`${pool.craft} clip đã kéo · ${craftClips} clip trên ổ · ${steps.length} công đoạn`}
                />
                <Check
                  ok={Math.max(pool.huyk, actions.length) >= HUYK_SLOTS}
                  label="HuyK thao tác"
                  detail={`${pool.huyk} clip đã kéo · ${huykClips} clip trên ổ · ${actions.length} hành động`}
                />
                <Check ok label="Outro" detail={`${pool.outro} clip trong kho chung`} />
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                Mỗi video dùng riêng {CRAFT_SLOTS} clip chế tác, {HUYK_SLOTS} cảnh HuyK, 1 sản phẩm hoàn thiện
                và 1 outro — không trùng với video khác trong lô. Kho hiện tại đủ cho{" "}
                <b style={{ color: "var(--ink)" }}>{maxDistinct} video</b> khác nhau hoàn toàn
                ({pool.productFinal || pool.product} clip hoàn thiện đã kéo).
                {hasProxy ? "" : " Mã này chưa có proxy nên video đầu phải chờ kéo footage từ ổ."}
              </div>
            </>
          )}
        </div>
      )}

      {sku && (
        <div className="panel">
          <h3>3 · Nội dung</h3>
          <textarea
            rows="6"
            placeholder="Dán nội dung dùng chung cho cả lô video…"
            value={script}
            disabled={running}
            onChange={(e) => setScript(e.target.value)}
            style={{ width: "100%" }}
          />
          <label>
            Hoặc lấy một nội dung mẫu
            <select
              value=""
              disabled={running}
              onChange={(e) => setScript(boot?.samples.find((s) => s.id === e.target.value)?.script ?? script)}
            >
              <option value="">— Chèn mẫu —</option>
              {(boot?.samples || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {sku && (
        <div className="panel">
          <h3>4 · Giọng đọc</h3>
          <label>
            Giọng HuyK nhân bản trên MiniMax
            <select value={voiceId} disabled={running} onChange={(e) => setVoiceId(e.target.value)}>
              <option value="">Giọng mặc định của hệ thống</option>
              {(voices.data || []).map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.voice_id}
                  {v.default ? " · đang dùng" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="hint">
            {voices.isError
              ? `Không lấy được danh sách giọng: ${voices.error.message}`
              : voices.data?.length
                ? `${voices.data.length} giọng trên tài khoản. Giọng này đọc nội dung ở trên, thời lượng video khớp đúng thời lượng lời đọc.`
                : "Chưa có giọng nhân bản nào trên tài khoản MiniMax."}
          </div>
        </div>
      )}

      {sku && (
        <div className="panel">
          <h3>5 · Số video cần dựng</h3>
          <label style={{ maxWidth: 220 }}>
            Mỗi video một tổ hợp công đoạn khác nhau
            <input
              type="number"
              min="1"
              max={MAX_VIDEOS}
              value={count}
              disabled={running}
              onChange={(e) => setCount(Math.min(MAX_VIDEOS, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
          {running ? (
            <button className="primary" onClick={() => (stopped.current = true)}>
              ■ Dừng sau video đang dựng
            </button>
          ) : (
            <button className="primary" disabled={!ready} onClick={runAll}>
              ▶ Dựng {count} video
            </button>
          )}
          {!ready && !running && (
            <div className="hint">Chọn sản phẩm và nhập nội dung (từ 10 ký tự) để bắt đầu.</div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="panel">
          <h3>
            Tiến độ · xong {done}/{rows.length}
            {failed ? ` · lỗi ${failed}` : ""}
          </h3>
          <table className="opt-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Công đoạn dùng</th>
                <th>Trạng thái</th>
                <th>Thời lượng</th>
                <th>Render</th>
                <th>Video</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={i === preview ? "chosen" : ""}
                  style={{ cursor: r.status === "done" ? "pointer" : "default" }}
                  onClick={() => r.status === "done" && setPreview(i)}
                >
                  <td>
                    <b>{i + 1}</b>
                  </td>
                  <td>
                    {r.craft?.length ? r.craft.join(" · ") : "—"}
                    {r.shoot ? <div className="hint">buổi quay {r.shoot}</div> : null}
                  </td>
                  <td>
                    {STATUS_LABEL[r.status] || "—"}
                    {r.error ? <div className="hint">{r.error}</div> : null}
                  </td>
                  <td>{r.duration ? `${r.duration.toFixed(1)}s` : "—"}</td>
                  <td>{r.seconds ? `${r.seconds}s` : "—"}</td>
                  <td>
                    {r.url ? (
                      <a href={media(r.url)} download>
                        ⤓ MP4
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <aside className="batch-preview">
      <div className="part-head">
        <h3>Video đã dựng</h3>
        {rows.length ? <span className={`chip ${done ? "ok" : ""}`}>{done}/{rows.length}</span> : null}
      </div>

      {rows.length ? (
        <div className="chips">
          {rows.map((r, i) => (
            <button
              key={i}
              className={`small-btn${i === preview ? " on" : ""}`}
              disabled={r.status !== "done"}
              onClick={() => setPreview(i)}
            >
              Video {i + 1}
              {r.status === "done" ? "" : r.status === "error" ? " ✕" : " …"}
            </button>
          ))}
        </div>
      ) : null}

      {shown?.url ? (
        <div className="batch-player">
          <video key={shown.url} src={media(shown.url)} poster={shown.poster} controls playsInline />
          <div className="hint">
            Video {preview + 1} · {shown.duration?.toFixed(1)}s · dựng mất {shown.seconds}s
            {shown.shoot ? ` · buổi quay ${shown.shoot}` : ""}
          </div>
          {shown.craft?.length ? <div className="hint">Công đoạn: {shown.craft.join(" · ")}</div> : null}
          <div className="chips">
            <a className="small-btn" href={media(shown.url)} download>
              ⤓ Tải MP4
            </a>
            <a className="small-btn" href={`?job=${shown.jobId}`}>
              ✎ Mở trong Studio
            </a>
          </div>
        </div>
      ) : (
        <div className="hint">
          {rows.length
            ? "Video nào dựng xong sẽ hiện ở đây, mỗi video một tab."
            : "Chọn sản phẩm, nhập nội dung rồi bấm dựng — từng video xong sẽ hiện ở đây."}
        </div>
      )}
    </aside>
    </>
  );
}
