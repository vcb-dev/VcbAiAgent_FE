// Tab "Render hàng loạt": một sản phẩm, một kịch bản, nhiều video khác nhau.
//
// Luồng: chọn sản phẩm → soát nguồn → chỉnh footage theo tuyến A4 (như Studio) → nội dung →
// giọng → nhạc → số video. Video đầu dùng đúng tuyến (chế tác theo quy trình); video sau
// không lấy clip đã dùng. Hết source của một mục thì mục đó quay lại từ đầu.
//
// Chạy lần lượt chứ không song song: một lần dựng đã chiếm gần hết CPU cho ffmpeg, chạy chồng
// nhau chỉ làm mọi video cùng chậm. Video nào lỗi thì ghi lại rồi đi tiếp, không chặn cả lô.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/features/studio/api";
import { nas } from "@/features/nas/api";
import { useBootstrap, useVoices } from "@/features/studio/useStudio";
import { useA4Plan, useCategories, useCraftSteps, useHuykActions, useNasStatus, useProducts } from "@/features/nas/useNas";
import { media } from "@/lib/formatHelpers";
import { A4_SLOTS, withSlotIndex } from "@/lib/a4Route";
import { withFormulaCraft } from "@/lib/craftFormula";
import A4RouteEditor, { toJobPlan } from "@/components/studio/A4RouteEditor";

const CRAFT_SLOTS = 4;      // tuyến A4 cần 4 công đoạn chế tác
const HUYK_SLOTS = 2;       // và 2 cảnh HuyK
const MAX_VIDEOS = 20;

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
const UNIQUE_ROLES = new Set(["product_hero", "craft", "huyk_talk", "outro", "product_final"]);

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
  const [musicId, setMusicId] = useState("");
  const [musicVol, setMusicVol] = useState(0.38);
  const [musicQ, setMusicQ] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState("");
  const musicFileRef = useRef(null);
  const [count, setCount] = useState(5);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(0);        // tab video đang xem ở cột phải
  const [running, setRunning] = useState(false);
  const [batchPlan, setBatchPlan] = useState(null);
  const stopped = useRef(false);

  const products = useProducts(category, true);      // chỉ mã đã có footage chế tác trên ổ
  const craftSteps = useCraftSteps(category, sku);
  const a4Plan = useA4Plan(category, sku);
  const product = useMemo(() => (products.data || []).find((p) => p.sku === sku), [products.data, sku]);
  const hasProxy = useMemo(() => (boot?.products || []).some((p) => p.sku === sku), [boot, sku]);
  const nasOn = useNasStatus().data?.nas?.mounted === true;

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
  // Chế tác / HuyK: không trùng khi còn source. Hoàn thiện / outro / hero: hết kho thì quay vòng.
  const distinctCraft = Math.max(1, Math.floor(Math.max(pool.craft, steps.length) / CRAFT_SLOTS));
  const distinctHuyk = Math.max(1, Math.floor(Math.max(pool.huyk, actions.length) / HUYK_SLOTS));
  const wrapFinal = Math.max(pool.productFinal, 1);
  const wrapHero = Math.max(pool.product - pool.productFinal, pool.product, 1);
  const wrapOutro = Math.max(pool.outro, 1);
  const maxWithoutWrap = Math.min(distinctCraft, distinctHuyk);

  const tracks = boot?.music || [];
  const musicDefaults = boot?.settings_defaults || {};
  const chosenMusic = musicId || musicDefaults.music_track || "default";
  const shownTracks = useMemo(() => {
    const q = musicQ.trim().toLowerCase();
    return q ? tracks.filter((t) => `${t.name} ${t.id}`.toLowerCase().includes(q)) : tracks;
  }, [tracks, musicQ]);

  useEffect(() => {
    setBatchPlan(null);
  }, [sku]);

  useEffect(() => {
    if (!sku || batchPlan?.sku === sku) return;
    if (a4Plan.data?.sku !== sku || craftSteps.isLoading) return;
    const ordered = withFormulaCraft(a4Plan.data, craftSteps.data || []);
    setBatchPlan({ ...ordered, sku, slots: withSlotIndex(ordered.slots || A4_SLOTS) });
  }, [sku, a4Plan.data, craftSteps.data, craftSteps.isLoading, batchPlan?.sku]);

  const writePlan = (next) => setBatchPlan({ ...next, sku });
  const hasA4 = (batchPlan?.craft?.length ?? 0) > 0;

  /** Còn thư mục chưa dùng của đúng công đoạn thì lấy cái đầu; hết thì quay lại từ đầu nhóm đó. */
  const pickUnused = (items, used, preferStep) => {
    const scoped = preferStep ? items.filter((x) => x.step === preferStep) : items.filter((x) => x.path);
    const source = scoped.length ? scoped : items;
    const free = source.filter((x) => x.path && !used.has(x.path));
    if (free.length) return free[0];
    return source[0] || null;
  };

  // Mặc định lấy đúng giọng hệ thống đang dùng cho HuyK.
  useEffect(() => {
    if (!voiceId) setVoiceId(voices.data?.find((v) => v.default)?.voice_id || "");
  }, [voices.data]);     // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!musicId && musicDefaults.music_track) setMusicId(musicDefaults.music_track);
    if (musicDefaults.music_volume != null) setMusicVol(musicDefaults.music_volume);
  }, [musicDefaults.music_track]);     // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!sku && hasA4 && script.trim().length >= 10 && count >= 1 && !craftSteps.isLoading;

  /** Video đầu dùng đúng tuyến editor vừa chỉnh; video sau giữ cùng loại công đoạn, đổi thư mục/clip. */
  const freshPlan = (index, seen, used) => {
    const base = batchPlan;
    if (!base?.craft?.length) throw new Error("chưa chọn footage theo tuyến A4");
    if (index === 0) {
      seen.add(signature(base));
      (base.craft || []).forEach((s) => s.path && used.craft.add(s.path));
      (base.huyk || []).forEach((s) => s.path && used.huyk.add(s.path));
      return base;
    }
    const craft = (base.craft || []).map((wanted) => {
      const pick = pickUnused(craftSteps.data || [], used.craft, wanted.step) || wanted;
      if (pick.path) used.craft.add(pick.path);
      return { path: pick.path, name: pick.name, step: pick.step || wanted.step };
    });
    const huyk = (base.huyk || []).map((wanted) => {
      const pick = pickUnused(huykActions.data || [], used.huyk) || wanted;
      if (pick.path) used.huyk.add(pick.path);
      return { path: pick.path, name: pick.name };
    });
    const next = { ...base, craft, huyk };
    if (seen.has(signature(next))) {
      // Hết thư mục khác thì vẫn dựng, clip exclude_clips lo phần không trùng.
    }
    seen.add(signature(next));
    return next;
  };

  /** Một video: kế hoạch A4 đã chỉnh → kéo footage còn thiếu → dựng → chờ render xong. */
  const renderOne = async (index, seen, usedFolders, taken) => {
    const set = (patch) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

    set({ status: "plan", error: "" });
    const plan = freshPlan(index, seen, usedFolders);
    set({ status: "prepare", shoot: plan.shoot, craft: (plan.craft || []).map((s) => s.name) });
    if (nasOn) {
      try {
        await nas.prepare(category, sku, {
          craft: (plan.craft || []).map((s) => s.path),
          huyk: (plan.huyk || []).map((s) => s.path),
        });
      } catch (err) {
        if (!hasProxy) throw err;
      }
    }

    set({ status: "build" });
    let job = await api.createJob({
      script,
      sku,
      template_id: "A4_v1",
      planner: "rules",
      voice_id: voiceId,
      music_track: chosenMusic,
      music_volume: musicVol,
      variant: index + 1,        // mỗi video một số biến thể để không bốc trùng cảnh
      exclude_clips: [...taken],  // clip các video trước đã dùng, video này phải tránh ra
      plan: toJobPlan(category, plan),
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
    const usedFolders = { craft: new Set(), huyk: new Set() };
    for (let i = 0; i < count; i += 1) {
      if (stopped.current) {
        setRows((list) => list.map((r, idx) => (idx === i ? { status: "skipped" } : r)));
        continue;
      }
      try {
        await renderOne(i, seen, usedFolders, taken);
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
                Video sau không lấy clip video trước đã dùng. Còn source của đúng công đoạn thì không
                trùng; hết kho của một mục (ví dụ {wrapFinal} clip hoàn thiện) thì mục đó quay lại từ
                đầu, các mục còn dư vẫn tách. Chế tác/HuyK đủ khoảng{" "}
                <b style={{ color: "var(--ink)" }}>{maxWithoutWrap} video</b> không trùng
                (hero {wrapHero} · hoàn thiện {wrapFinal} · outro {wrapOutro} — hết thì lặp).
                {hasProxy ? "" : " Mã này chưa có proxy nên video đầu phải chờ kéo footage từ ổ."}
              </div>
            </>
        )}
      </div>
      )}

      {sku && (
        <div className="panel">
          <A4RouteEditor
            title="3 · Footage theo tuyến A4"
            sku={sku}
            boot={boot}
            product={product}
            draft={batchPlan}
            writePlan={writePlan}
            plan={a4Plan}
            craftPool={craftSteps}
            huykPool={huykActions}
            disabled={running}
          />
          <div className="hint" style={{ marginTop: 8 }}>
            Cả lô bám tuyến này, chế tác theo thứ tự quy trình. Video sau đổi clip; hết source của
            một mục thì mục đó dùng lại từ đầu.
          </div>
        </div>
      )}

      {sku && (
        <div className="panel">
          <h3>4 · Nội dung</h3>
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
          <h3>5 · Giọng đọc</h3>
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
          <h3>6 · Nhạc nền</h3>
          <p className="hint" style={{ margin: "6px 0 10px" }}>
            Cả lô dùng chung một bài. Nhạc chạy đến trước outro rồi fade tắt — outro giữ tiếng gốc.
            Tải mp3/wav/m4a thì bài nằm trên volume (không ghi database), cả studio lẫn hàng loạt đều thấy.
          </p>
          <input
            ref={musicFileRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setMusicBusy(true);
              setMusicError("");
              try {
                const track = await api.musicUpload(file);
                await queryClient.invalidateQueries({ queryKey: ["studio", "bootstrap"] });
                setMusicId(track.id);
              } catch (err) {
                setMusicError(err.message);
              } finally {
                setMusicBusy(false);
              }
            }}
          />
          <button
            type="button"
            className="small-btn"
            disabled={running || musicBusy}
            onClick={() => musicFileRef.current?.click()}
          >
            {musicBusy ? "Đang tải bài…" : "⤒ Tải bài từ máy"}
          </button>
          {musicError ? <div className="hint" style={{ color: "#e66767" }}>{musicError}</div> : null}
          <div className="field">
            Âm lượng
            <div className="range-row">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={musicVol}
                disabled={running}
                onChange={(e) => setMusicVol(Number(e.target.value))}
              />
              <output>{Math.round(musicVol * 100)}%</output>
            </div>
          </div>
          <input
            type="search"
            placeholder="Tìm bài…"
            value={musicQ}
            disabled={running}
            onChange={(e) => setMusicQ(e.target.value)}
            style={{ width: "100%", margin: "8px 0 6px" }}
          />
          <div className="opt-list batch-music">
            {shownTracks.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`opt${chosenMusic === t.id ? " on" : ""}`}
                disabled={running}
                onClick={() => setMusicId(t.id)}
              >
                <b>{t.name}</b>
                <small>{t.duration ? `${t.duration}s` : ""}</small>
              </button>
            ))}
          </div>
          {!shownTracks.length ? (
            <div className="hint">{tracks.length ? "Không có bài khớp." : "Chưa có nhạc nền trên máy chủ."}</div>
          ) : (
            <div className="hint" style={{ marginTop: 6 }}>
              Đang chọn: <b style={{ color: "var(--ink)" }}>{tracks.find((t) => t.id === chosenMusic)?.name || chosenMusic}</b>
              {musicVol <= 0 ? " · đã tắt (0%)" : ""}
            </div>
          )}
        </div>
      )}

      {sku && (
        <div className="panel">
          <h3>7 · Số video cần dựng</h3>
          <label style={{ maxWidth: 220 }}>
            Cùng tuyến A4 đã chỉnh, mỗi video một bộ clip khác
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
            <div className="hint">
              {!hasA4
                ? "Chọn sản phẩm và đợi tuyến A4 (hoặc bốc cảnh) rồi nhập nội dung."
                : "Nhập nội dung (từ 10 ký tự) để bắt đầu."}
            </div>
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
