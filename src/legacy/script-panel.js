// Studio · Kịch bản tab, voice-first: ① pick a script from Kho content (or type) → ② make / pick the voice and
// listen → ③ choose the product footage set → build. The footage is cut to the voice's real length.
import { api } from "./api-client.js";
import { actions, store, toast } from "./editor-store.js";
import { esc, media } from "./format-helpers.js";

const FAM = { A1: "A1 · Mass traffic", A2: "A2 · Kiến thức", A3: "A3 · Niềm tin", A4: "A4 · Chế tác", A5: "A5 · Hero" };
const st = { items: [], omni: null, minimax: null, langs: {}, content: null, voice: null, scriptAtVoice: "", lang: "vi", trSeq: 0, a4: null, huyk: [] };
const LANG_NAMES = { vi: "Tiếng Việt", en: "English", th: "ไทย · Thái", ja: "日本語 · Nhật", id: "Indonesia", zh: "中文 · Đài Loan", es: "Español" };
const $ = (id) => document.getElementById(id);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

const stepHead = (n, label, extra = "") => `<div class="step-head"><span class="step-n">${n}</span><span class="eyebrow">${label}</span><span class="spacer"></span>${extra}</div>`;

export function scriptForm(boot) {
  return `<div class="step-card">${stepHead(1, "Kịch bản", '<span id="content-fam"></span>')}
      <div class="aiw">
        <textarea id="aiw-topic" rows="2" placeholder="Nhập chủ đề để AI tìm thông tin và viết. VD: Viên kim cương Hope và lời nguyền" aria-label="Chủ đề cho AI viết"></textarea>
        <div class="aiw-row"><select id="aiw-family" aria-label="Tuyến nội dung" title="Tuyến nội dung">${Object.keys(FAM).map((f) => `<option value="${f}" title="${FAM[f]}">${f}</option>`).join("")}</select>
          <label class="aiw-chk" title="AI tìm dữ kiện thật trên Google trước khi viết"><input type="checkbox" id="aiw-web" checked> Tìm trên mạng</label>
</div>
        <button id="aiw-btn" class="small-btn aiw-go" type="button">✨ AI viết kịch bản</button>
        <div id="aiw-hint" class="hint"></div></div>
      <div class="aiw-or"><span>hoặc chọn trong kho</span></div>
      <div style="display:flex;gap:6px"><select id="content-select" aria-label="Kịch bản trong kho" style="flex:1;min-width:0"><option value="">— Tự nhập kịch bản —</option></select>
        <select id="lang-select" aria-label="Ngôn ngữ video" title="Ngôn ngữ của video: AI dịch kịch bản, HuyK đọc giọng tiếng đó, phụ đề tiếng đó" style="width:auto">
          ${Object.entries(LANG_NAMES).map(([k]) => `<option value="${k}">${k.toUpperCase()}</option>`).join("")}</select></div>
      <input id="content-search" type="text" placeholder="Tìm trong kho…" aria-label="Tìm kịch bản">
      <div id="content-meta" class="hint"></div>
      <textarea id="script-input" rows="7" placeholder="Chọn kịch bản trong kho hoặc dán kịch bản…" aria-label="Lời kịch bản"></textarea></div>
    <div class="step-card">${stepHead(2, "Sản phẩm")}
      <select id="product-select" aria-label="Bộ footage sản phẩm"><option value="">— Không gắn sản phẩm —</option>
        ${boot.products.map((p) => `<option value="${p.sku}">${esc(p.sku)} · ${esc((p.name || "").replace(/-/g, " "))} (${p.clips || 0} clip · ${(p.step_labels || p.steps || []).length} CĐ)</option>`).join("")}</select>
      <div id="product-steps" class="hint">Chỉ hiện mã đủ ≥3 công đoạn chế tác.</div>
      <label class="field">Tuyến nội dung <select id="line-select" aria-label="Tuyến nội dung"><option value="A4">A4</option></select></label>
      <div id="a4-route"></div>
      <details class="hint"><summary>Tuỳ chọn dựng</summary>
        <label class="field">Template <select id="template-select"><option value="auto">Tự động</option>
          ${boot.templates.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join("")}</select></label>
        <label class="field">Tách phân cảnh <select id="planner-select"><option value="rules" selected>Nhanh · tức thì</option>
          <option value="claude" ${boot.claude_available ? "" : "disabled"}>AI · kỹ hơn, chậm hơn${boot.claude_available ? "" : " (cần khoá AI)"}</option></select></label>
        <div class="hint">Kịch bản từ Kho content dùng sẵn phân cảnh AI đã viết, không phải chờ.</div></details></div>
    <div class="step-card" id="illus-card">${stepHead(3, "Hình minh hoạ", '<span class="hint">A1 · A2 · A3</span>')}
      <label class="ill-chk"><input type="checkbox" id="ill-web"> <span><b>Cào hình &amp; video trên mạng</b><small>Báo, bảo tàng, YouTube, Wikimedia… AI chấm độ khớp từng câu rồi tự ghép</small></span></label>
      <label class="ill-chk"><input type="checkbox" id="ill-ai"> <span><b>AI tạo ảnh minh hoạ</b><small id="ill-ai-sub">Gemini vẽ ảnh cho câu không tìm được hình khớp · ≈1.000đ/ảnh</small></span></label></div>
    <button id="build-btn" class="primary">Dựng video</button>
    <div id="build-hint" class="hint" style="text-align:center"></div>
    <div id="job-summary" class="hint hidden"></div>`;
}

function contentOptions() {
  const q = ($("content-search").value || "").trim().toLowerCase();
  const list = st.items.filter((c) => c.status !== "archived" && (!q || `${c.title} ${c.script}`.toLowerCase().includes(q)));
  const groups = Object.keys(FAM).map((f) => {
    const rows = list.filter((c) => c.family === f);
    return rows.length ? `<optgroup label="${FAM[f]} (${rows.length})">${rows.map((c) =>
      `<option value="${esc(c.id)}">${esc(c.title)}${Object.keys(c.voices || {}).length ? " 🎙" : ""}${c.status === "draft" ? " · nháp" : ""}</option>`).join("")}</optgroup>` : "";
  }).join("");
  const cur = $("content-select").value;
  $("content-select").innerHTML = `<option value="">— Tự nhập kịch bản —</option>${groups}`;
  if (list.some((c) => c.id === cur)) $("content-select").value = cur;
}

function voiceStale() {
  return st.voice && st.voice.text !== $("script-input").value.trim();
}

export function voiceStudioHtml() {
  return `<div class="step-card" style="margin-bottom:12px">
      <div class="step-head"><span class="eyebrow">Giọng HuyK</span><span class="spacer"></span><span id="voice-dur" class="mono hint"></span></div>
      <div id="voice-list"></div>
      <div id="voice-player"></div>
      <div style="display:flex;gap:6px;align-items:center">
        <select id="omni-voice" title="Giọng HuyK" aria-label="Giọng HuyK" style="flex:1;min-width:110px"></select>
        <button id="voice-btn" class="small-btn" type="button">Tạo voice</button></div>
      <div id="voice-hint" class="hint"></div></div>`;
}

export function mountVoiceStudio(root) {
  root.innerHTML = voiceStudioHtml();
  root.querySelector("#voice-btn").addEventListener("click", (e) => makeVoice(e.currentTarget));
  root.querySelector("#voice-list").addEventListener("change", (e) => {
    const v = st.content?.voices?.[e.target.value];
    if (v) { st.voice = { audio: v.audio, duration: v.duration, provider: v.uploaded ? "file tải lên" : v.provider, text: $("script-input").value.trim() }; paintVoice(); }
  });
  root.querySelector("#voice-player").addEventListener("click", (e) => {
    if (!e.target.closest("#voice-to-tl") || !st.voice || voiceStale()) return;
    const job = store.job;
    if (job && (job.script || "").trim() === st.voice.text) { actions.voiceTrack(st.voice.audio); return; }
    if (job && !confirm("Timeline đang mở là kịch bản khác. Dựng timeline mới với kịch bản + voice này?")) return;
    $("build-btn").click();
  });
  paintVoice();
  refreshVoices();
}

let voiceFetchAt = 0;
export function ensureMiniMaxVoices() {
  const sel = $("omni-voice");
  if (st.minimax?.voices?.length && sel && [...sel.options].some((o) => o.value)) return;
  if (Date.now() - voiceFetchAt < 2000) return;
  voiceFetchAt = Date.now();
  refreshVoices();
}

async function refreshVoices() {
  try {
    const vs = await api.voiceStatus();
    st.omni = vs.omni;
    st.minimax = vs.minimax;
    paintVoice();
  } catch { /* the select stays on the loading label until the next open */ }
}

function paintVoice() {
  if (!$("voice-list")) return;
  const c = st.content;
  const ready = Object.entries(c?.voices || {}).filter(([lang, v]) => lang === st.lang && (v.uploaded || !v.text || v.text.trim() === $("script-input").value.trim()));
  $("voice-list").innerHTML = ready.length ? ready.map(([lang, v]) => `<label class="hint" style="display:flex;gap:6px;align-items:center;cursor:pointer">
      <input type="radio" name="voice-pick" value="${esc(lang)}" ${st.voice?.audio === v.audio ? "checked" : ""}>
      Voice có sẵn · ${esc(lang.toUpperCase())} · ${(v.duration || 0).toFixed(1)}s · ${v.uploaded ? "file tải lên" : esc((v.provider || "").split(":")[0])}</label>`).join("")
    : st.voice ? "" : '<div class="hint">Kịch bản này chưa có voice — chọn giọng MiniMax rồi bấm "Tạo voice".</div>';
  const mm = st.minimax?.voices?.length ? st.minimax : null;
  const sel = $("omni-voice");
  if (mm) {
    const preferred = mm.by_lang?.[st.lang] || mm.by_lang?.vi || mm.voices[0].id;
    const pick = mm.voices.some((v) => v.id === sel.value) ? sel.value : preferred;
    sel.innerHTML = mm.voices.map((v) => `<option value="${esc(v.id)}" ${v.id === pick ? "selected" : ""}>${esc(v.label)}</option>`).join("");
    sel.disabled = false;
  } else {
    sel.innerHTML = `<option value="">${st.minimax ? "Chưa có giọng MiniMax" : "Đang tải giọng MiniMax…"}</option>`;
    sel.disabled = true;
  }
  const v = st.voice;
  $("voice-player").innerHTML = v ? `<audio controls preload="metadata" src="${esc(media(v.audio))}" style="width:100%;height:34px"></audio>
    <button id="voice-to-tl" class="small-btn" style="width:100%;margin-top:6px" ${voiceStale() ? "disabled" : ""}>Thêm vào timeline</button>` : "";
  $("voice-hint").innerHTML = voiceStale() ? '<span style="color:var(--warn)">Kịch bản đã sửa sau khi tạo voice — bấm "Tạo voice" lại cho khớp.</span>'
    : v ? "Footage sẽ được cắt ghép đúng theo độ dài voice này." : "Chưa tạo voice: lúc dựng, hệ thống đọc bằng giọng MiniMax đang chọn.";
  $("voice-dur").textContent = v ? fmt(v.duration || 0) : "";
  $("build-hint").textContent = v && !voiceStale() ? `Dựng theo voice ${(v.duration || 0).toFixed(1)}s → video ≈ ${fmt((v.duration || 0) + 1)}` : "";
  if (st.a4) {
    const before = (st.a4.slots || []).map((s) => s.seconds).join(",");
    applySlotSeconds(st.a4);
    if (before !== (st.a4.slots || []).map((s) => s.seconds).join(",")) paintA4();
  }
}

function savedVoice(c, lang, script) {
  const sv = c?.voices?.[lang];
  if (!sv || !(sv.uploaded || !sv.text || sv.text.trim() === script.trim())) return null;
  return { audio: sv.audio, duration: sv.duration, provider: sv.uploaded ? "file tải lên" : sv.provider, text: script.trim() };
}

async function applyLang() {
  /** Script of the picked Kho content in the chosen language (AI translation, cached on the server). */
  const c = st.content, lang = st.lang, seq = ++st.trSeq;
  $("market-chip").textContent = lang.toUpperCase();
  $("market-chip").title = `${LANG_NAMES[lang]} · lời + phụ đề ${lang === "vi" ? "· có outro HuyK + logo" : "· không outro, không logo"}`;
  paintA4();
  if (!c) { paintVoice(); return; }
  {
    const same = lang === (c.language || "vi");
    if (!same) { $("script-input").value = ""; $("script-input").placeholder = "Đang dịch kịch bản…"; }
    try {
      const tr = await api.contentTranslation(c.id, lang);   // same language: the script without the self-intro line
      if (seq !== st.trSeq) return;
      $("script-input").value = tr.script;
      $("content-meta").innerHTML = `${same ? "" : `<b>${esc(tr.title)}</b> · `}${esc(c.topic)}${c.kind ? ` · dùng chung mọi ${esc(c.kind)}` : ""}`;
    } catch (err) {
      if (seq !== st.trSeq) return;
      $("script-input").value = c.script;
      toast(`Dịch kịch bản: ${err.message}`);
    } finally { $("script-input").placeholder = "Chọn kịch bản trong kho hoặc dán kịch bản…"; }
  }
  st.voice = savedVoice(c, lang, $("script-input").value);
  paintVoice();
}

function pickContent(id) {
  const c = st.items.find((x) => x.id === id) || null;
  st.content = c;
  st.voice = null;
  if (c) {
    $("script-input").value = c.script;
    applyLang();
    if (c.sku && store.boot.products.some((p) => p.sku === c.sku)) $("product-select").value = c.sku;
    $("content-meta").innerHTML = `${esc(c.topic)}${c.kind ? ` · dùng chung mọi ${esc(c.kind)}` : ""}`;
    $("content-fam").innerHTML = `<span class="fam ${esc(c.family)}">${esc(c.family)}</span>`;
  } else {
    $("content-meta").textContent = "";
    $("content-fam").innerHTML = "";
  }
  if (c && FAM[c.family]) $("aiw-family").value = c.family;
  showSteps();
  paintVoice();
  if ($("illus-card")) illusHint();
}

function illusHint() {
  if (!$("ill-ai").disabled) $("ill-ai-sub").textContent = $("ill-web").checked
    ? "Gemini vẽ ảnh cho câu không tìm được hình khớp · ≈1.000đ/ảnh" : "Không cào mạng: Gemini vẽ ảnh cho mọi câu minh hoạ · ≈1.000đ/ảnh";
  const fam = st.content?.family;
  $("illus-card").classList.toggle("dim", !!fam && !["A1", "A2", "A3"].includes(fam));
}

/** Topic typed by the editor → AI looks it up on the web → 5A script, saved in Kho content as a draft, picked here. */
async function aiWrite(btn) {
  const topic = $("aiw-topic").value.trim();
  if (topic.length < 3) { toast("Nhập chủ đề cho AI viết"); $("aiw-topic").focus(); return; }
  const web = $("aiw-web").checked;
  btn.disabled = true; btn.textContent = "⏳ Đang viết…";
  $("aiw-hint").innerHTML = `<span class="aiw-busy"></span>${web ? "AI đang tìm thông tin trên mạng rồi viết kịch bản" : "AI đang viết kịch bản"} · khoảng ${web ? "40–90" : "20–40"} giây`;
  try {
    const res = await fetch("/api/content/write", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, family: $("aiw-family").value, sku: $("product-select").value || "", web }) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(r.detail || res.statusText);
    st.items = [r, ...st.items.filter((x) => x.id !== r.id)];
    $("content-search").value = "";
    contentOptions();
    $("content-select").value = r.id;
    pickContent(r.id);
    const src = r.research?.sources || [];
    $("aiw-hint").innerHTML = `✓ Đã viết <b>${esc(r.title)}</b> · lưu nháp trong Kho content${src.length ? ` · ${src.length} nguồn: ` + src.slice(0, 4).map((x) =>
      `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || "nguồn")}</a>`).join(", ") : web ? " · không tìm được nguồn, AI viết theo hiểu biết chung — nên kiểm tra lại dữ kiện" : ""}`;
  } catch (err) {
    $("aiw-hint").innerHTML = `<span style="color:var(--warn)">AI viết lỗi: ${esc(err.message)}</span>`;
  } finally { btn.disabled = false; btn.textContent = "✨ AI viết kịch bản"; }
}

const A4_SLOTS = [
  { role: "Sản phẩm", seconds: 5, from: "product", variant: "hero" },
  { role: "HuyK", seconds: 4, from: "huyk" },
  { role: "Chế tác 1", seconds: 3, from: "craft" },
  { role: "Chế tác 2", seconds: 3, from: "craft" },
  { role: "Chế tác 3", seconds: 3, from: "craft" },
  { role: "HuyK", seconds: 4, from: "huyk" },
  { role: "Chế tác 4", seconds: 3, from: "craft" },
  { role: "Sản phẩm hoàn thiện", seconds: 8, from: "product", variant: "final" },
  { role: "Outro", seconds: 4, from: "outro" },
];
const A4_KINDS = [
  { key: "product:hero", from: "product", variant: "hero", role: "Sản phẩm", seconds: 5 },
  { key: "huyk", from: "huyk", role: "HuyK", seconds: 4 },
  { key: "craft", from: "craft", role: "Chế tác", seconds: 3 },
  { key: "product:final", from: "product", variant: "final", role: "Sản phẩm hoàn thiện", seconds: 8 },
  { key: "outro", from: "outro", role: "Outro", seconds: 4 },
];
const FINAL_SEC = 8;
const ORIGIN_LABEL = { huyk_sp: "HuyK chế tác", tho: "Thợ xưởng", legacy: "Kho cũ" };
const a4Key = (s) => (s.from === "product" ? `product:${s.variant || "hero"}` : s.from);
const isFinalSlot = (s) => s.from === "product" && s.variant === "final";

function withSlotIndex(slots) {
  const count = { craft: 0, huyk: 0 };
  return (slots || A4_SLOTS).map((s) => {
    if (s.from === "craft") {
      const at = count.craft++;
      return { ...s, at, role: `Chế tác ${at + 1}`, seconds: s.seconds || 3 };
    }
    if (s.from === "huyk") {
      const at = count.huyk++;
      return { ...s, at, role: "HuyK", seconds: s.seconds || 4 };
    }
    if (s.from === "product") {
      const final = s.variant === "final";
      return { ...s, role: final ? "Sản phẩm hoàn thiện" : "Sản phẩm", seconds: s.seconds || (final ? 8 : 5) };
    }
    return { ...s, role: "Outro", seconds: s.seconds || 4 };
  });
}

function craftSlotCount(slots) {
  return withSlotIndex(slots || A4_SLOTS).filter((s) => s.from === "craft").length || 4;
}

function orderedCraftSteps(steps) {
  return (steps || []).filter((s) => s.step && s.step !== "hoan_thien" && s.step !== "__unsorted");
}

function formulaCraft(steps, randomize, slots) {
  const ordered = orderedCraftSteps(steps);
  const n = Math.min(craftSlotCount(slots), ordered.length);
  if (!n) return [];
  let start = 0;
  if (randomize && ordered.length > n) start = Math.floor(Math.random() * (ordered.length - n + 1));
  return ordered.slice(start, start + n).map((s, at) => ({ step: s.step, name: s.label, at }));
}

function originLists(p) {
  const out = {};
  const detail = p?.origin_detail || {};
  for (const key of ["huyk_sp", "tho", "legacy"]) {
    const rows = orderedCraftSteps(detail[key] || []);
    if (rows.length) out[key] = rows;
  }
  return out;
}

function originKeys(p) {
  const lists = originLists(p);
  const keys = Object.keys(lists).filter((k) => k === "huyk_sp" || k === "tho");
  return keys.length ? keys : Object.keys(lists);
}

function applyCraftChain(draft, p, fromAt) {
  if (!draft) return;
  const origin = draft.craftOrigin;
  const ordered = (origin && originLists(p)[origin]) || [];
  const seq = withSlotIndex(draft.slots).filter((s) => s.from === "craft" && draft.craft?.[s.at]?.sequential);
  if (!seq.length || !ordered.length || !origin) return;
  const head = fromAt == null ? seq[0] : (seq.find((s) => s.at === fromAt) || seq[0]);
  const rest = seq.filter((s) => s.at >= head.at);
  let start = ordered.findIndex((s) => s.step === draft.craft[head.at]?.step);
  if (start < 0) start = 0;
  rest.forEach((slot, i) => {
    const step = ordered[Math.min(start + i, ordered.length - 1)];
    draft.craft[slot.at] = { step: step.step, name: step.label, at: slot.at, sequential: true, origin };
  });
}

function enableCraftSeq(draft, p, at, on) {
  draft.craft = draft.craft || [];
  const row = { ...(draft.craft[at] || { at }), at, sequential: !!on };
  draft.craft[at] = row;
  if (!on) {
    draft.craft[at] = { ...row, sequential: false };
    applyCraftChain(draft, p);
    return;
  }
  const keys = originKeys(p);
  if (!draft.craftOrigin && keys.length === 1) draft.craftOrigin = keys[0];
  withSlotIndex(draft.slots).filter((s) => s.from === "craft").forEach((s) => {
    draft.craft[s.at] = { ...(draft.craft[s.at] || { at: s.at }), at: s.at, sequential: true, origin: draft.craftOrigin || null };
  });
  applyCraftChain(draft, p);
}

function applySlotSeconds(draft, force) {
  if (!draft?.slots?.length) return draft;
  const slots = withSlotIndex(draft.slots);
  const voice = Number(st.voice?.duration) || 0;
  const share = slots.filter((s) => !isFinalSlot(s) && s.from !== "outro");
  const n = share.length;
  const remain = voice > 0 ? Math.max(n * 1.5, voice - FINAL_SEC) : 0;
  const each = n && remain ? Math.round((remain / n) * 10) / 10 : 0;
  draft.slots = slots.map((s) => {
    if (isFinalSlot(s)) return { ...s, seconds: FINAL_SEC };
    if (s.from === "outro") return { ...s, seconds: s.manualSec && !force ? s.seconds : (s.seconds || 4) };
    if (s.manualSec && !force) return s;
    const sec = each || s.seconds || (s.from === "huyk" ? 4 : s.from === "craft" ? 3 : 5);
    return { ...s, seconds: sec };
  });
  return draft;
}

function productOf() {
  return store.boot.products.find((x) => x.sku === $("product-select").value);
}

function ensureA4() {
  const p = productOf();
  if (!p) { st.a4 = null; return null; }
  if (st.a4?.sku === p.sku) return st.a4;
  const saved = store.job?.a4_line && store.job.sku === p.sku ? store.job.a4_plan : null;
  if (saved?.slots?.length) {
    st.a4 = { sku: p.sku, slots: saved.slots.map((s) => ({ ...s, from: s.from || s.kind })), craft: saved.craft || [], huyk: saved.huyk || [], craftOrigin: saved.craft_origin || saved.craftOrigin || null };
    applySlotSeconds(st.a4);
    return st.a4;
  }
  st.a4 = { sku: p.sku, slots: A4_SLOTS.map((s) => ({ ...s })), craft: formulaCraft(p.step_detail, false, A4_SLOTS), huyk: [] };
  applySlotSeconds(st.a4, true);
  return st.a4;
}

function a4Role(slot) {
  if (slot.from === "product") return slot.variant === "final" ? "product_final" : "product_hero";
  if (slot.from === "huyk") return "huyk_talk";
  if (slot.from === "craft") return "craft";
  return "outro";
}

async function liveA4(index) {
  const job = store.job;
  const draft = st.a4;
  if (!job?.a4_line || !draft || job.sku !== draft.sku || job.parts.length !== withSlotIndex(draft.slots).length) return;
  const slot = withSlotIndex(draft.slots)[index];
  const part = job.parts[index];
  if (!slot || !part || store.busy) return;
  const craft = slot.from === "craft" ? draft.craft?.[slot.at]?.step : null;
  const origin = slot.from === "craft" ? (draft.craft?.[slot.at]?.origin || draft.craftOrigin) : null;
  return actions.source(part.part_id, a4Role(slot), craft, null, origin);
}

function a4Payload() {
  const draft = ensureA4();
  if (!draft) return null;
  const slots = withSlotIndex(draft.slots).filter((s) => st.lang === "vi" || s.from !== "outro");
  return {
    slots: slots.map((s) => ({ kind: s.from, variant: s.variant || null, seconds: s.seconds, at: s.at ?? null })),
    craft: (draft.craft || []).filter(Boolean).map((c) => ({ step: c.step, name: c.name, at: c.at, origin: c.origin || draft.craftOrigin || null, sequential: !!c.sequential })),
    huyk: [],
    craft_origin: draft.craftOrigin || null,
  };
}

function paintA4() {
  const root = $("a4-route");
  if (!root) return;
  const p = productOf();
  const draft = ensureA4();
  if (!p || !draft) {
    root.innerHTML = `<div class="hint">Chọn sản phẩm để chỉnh các ô footage A4.</div>`;
    return;
  }
  const slots = withSlotIndex(draft.slots);
  const steps = p.step_detail || [];
  const name = (p.name || p.sku).replace(/-/g, " ");
  root.innerHTML = `<div class="sec-title"><span>Footage theo tuyến A4</span></div>
    <div class="hint">Trong dropdown Chế tác chọn “Theo thứ tự công đoạn” rồi kho HuyK chế tác hoặc Thợ xưởng — các ô sau lấy bước liền kề. Ô HuyK bốc ngẫu nhiên. Hoàn thiện cố định ${FINAL_SEC}s; ô khác chia đều theo voice.</div>
    ${slots.map((s, i) => {
      if (s.from === "outro" && st.lang !== "vi") return "";
      const current = s.from === "craft" ? draft.craft?.[s.at] : s.from === "huyk" ? draft.huyk?.[s.at] : null;
      const kinds = st.lang === "vi" ? A4_KINDS : A4_KINDS.filter((k) => k.key !== "outro");
      const kindOpts = kinds.map((k) => `<option value="${k.key}" ${a4Key(s) === k.key ? "selected" : ""}>${esc(s.from === "craft" && k.key === "craft" ? s.role : k.role)}</option>`).join("");
      const secLocked = isFinalSlot(s);
      const secBox = `<input class="a4-sec" type="number" min="1" max="90" step="0.5" data-a4="sec" data-i="${i}" value="${Number(s.seconds) || 1}" ${secLocked ? "disabled" : ""} title="${secLocked ? `Hoàn thiện cố định ${FINAL_SEC}s` : "Giây công đoạn"}" aria-label="Giây ô ${i + 1}">`;
      let src = `<b>${esc(s.from === "product" ? name : "kho outro · chỉ tiếng Việt")}</b>`;
      if (s.from === "product") {
        const n = s.variant === "final" ? (p.final_clips || 0) : (p.hero_clips || 0);
        src = `<b>${esc(name)}</b><span class="muted"> · ${n} clip</span>`;
      }
      if (s.from === "craft") {
        const seqOn = !!current?.sequential;
        const origin = draft.craftOrigin || current?.origin || "";
        const seqCraft = withSlotIndex(draft.slots).filter((x) => x.from === "craft" && draft.craft?.[x.at]?.sequential);
        const chainHead = seqCraft[0]?.at === s.at;
        const seqOpts = originKeys(p).map((k) => `<option value="seq:${esc(k)}" ${seqOn && origin === k ? "selected" : ""}>${esc(ORIGIN_LABEL[k] || k)}</option>`).join("");
        const extra = !seqOn && current?.step && !steps.some((st) => st.step === current.step) ? `<option value="${esc(current.step)}">${esc(current.name || current.step)}</option>` : "";
        const stepHint = seqOn && current?.name ? `<span class="muted"> · ${esc(current.name)}</span>` : "";
        src = `<span class="slot-src"><select data-a4="craft" data-i="${i}" aria-label="${esc(s.role)}" ${seqOn && !chainHead ? "disabled" : ""}>
            <optgroup label="Theo thứ tự công đoạn">${seqOpts || `<option value="" disabled>Chưa có kho</option>`}</optgroup>
            <optgroup label="Chọn công đoạn">
              ${seqOn ? "" : (current?.step ? "" : `<option value="">— chọn công đoạn —</option>`)}${extra}
              ${steps.map((st) => `<option value="${esc(st.step)}" ${!seqOn && current?.step === st.step ? "selected" : ""}>${esc(st.label)}${st.clips != null ? ` · ${st.clips} clip` : ""}</option>`).join("")}
            </optgroup>
          </select>${stepHint}<button class="small-btn" type="button" data-a4="roll" data-i="${i}" title="Đổi công đoạn" ${seqOn && !chainHead ? "disabled" : ""}>↻</button></span>`;
      } else if (s.from === "huyk") {
        src = `<b>HuyK · ngẫu nhiên</b>`;
      }
      return `<div class="a4-slot"><div class="a4-slot-head"><select class="a4-kind" data-a4="kind" data-i="${i}" aria-label="Loại ô ${i + 1}">${kindOpts}</select>${secBox}${src}</div></div>`;
    }).join("")}
    ${steps.length ? "" : `<div class="hint">Mã ${esc(p.sku)} chưa có công đoạn chế tác trong catalog.</div>`}`;
}

function onA4Change(e) {
  const act = e.target.dataset.a4;
  const draft = st.a4;
  if (!draft || !act) return;
  const i = Number(e.target.dataset.i);
  const slots = withSlotIndex(draft.slots);
  const slot = slots[i];
  if (act === "kind") {
    const kind = A4_KINDS.find((k) => k.key === e.target.value);
    if (!kind) return;
    draft.slots = withSlotIndex(draft.slots.map((s, n) => n === i ? { from: kind.from, variant: kind.variant } : s));
    applySlotSeconds(draft);
    const next = withSlotIndex(draft.slots)[i];
    if (next.from === "craft" && !draft.craft?.[next.at]) {
      const step = (productOf()?.step_detail || [])[0];
      if (step) draft.craft[next.at] = { step: step.step, name: step.label, at: next.at };
    }
  } else if (act === "craft" && slot?.from === "craft" && e.target.value) {
    const p = productOf();
    const val = e.target.value;
    if (val.startsWith("seq:")) {
      draft.craftOrigin = val.slice(4);
      enableCraftSeq(draft, p, slot.at, true);
    } else {
      const step = (p?.step_detail || []).find((s) => s.step === val);
      enableCraftSeq(draft, p, slot.at, false);
      draft.craft[slot.at] = { ...(draft.craft[slot.at] || {}), step: val, name: step?.label || val, at: slot.at, sequential: false };
    }
  } else if (act === "sec" && slot) {
    const sec = Number(e.target.value);
    if (!(sec > 0)) return;
    draft.slots = slots.map((s, n) => n === i ? { ...s, seconds: Math.round(sec * 10) / 10, manualSec: true } : s);
    return;
  } else return;
  paintA4();
  if (act === "craft" && (e.target.value.startsWith("seq:") || draft.craft?.[slot?.at]?.sequential === false)) {
    withSlotIndex(draft.slots).forEach((s, n) => { if (s.from === "craft") liveA4(n); });
    return;
  }
  liveA4(i);
}

async function onA4Click(e) {
  const btn = e.target.closest("[data-a4]");
  const draft = st.a4;
  if (!btn || !draft || btn.tagName !== "BUTTON") return;
  const p = productOf();
  if (btn.dataset.a4 === "roll") {
    const slot = withSlotIndex(draft.slots)[Number(btn.dataset.i)];
    if (!slot) return;
    if (slot.from === "craft") {
      const origin = draft.craftOrigin;
      const seq = !!draft.craft?.[slot.at]?.sequential;
      const ordered = (seq && origin && originLists(p)[origin]) || orderedCraftSteps(p?.step_detail);
      const cur = draft.craft?.[slot.at]?.step;
      const idx = ordered.findIndex((s) => s.step === cur);
      const step = ordered[(idx + 1) % ordered.length] || ordered[0];
      if (step) {
        draft.craft[slot.at] = { ...(draft.craft[slot.at] || {}), step: step.step, name: step.label, at: slot.at };
        if (seq) applyCraftChain(draft, p, slot.at);
      }
    } else return;
    paintA4();
    if (slot.from === "craft" && draft.craft?.[slot.at]?.sequential) {
      withSlotIndex(draft.slots).forEach((s, n) => { if (s.from === "craft") liveA4(n); });
    } else liveA4(Number(btn.dataset.i));
    return;
  }
  paintA4();
  const open = store.job?.a4_line && store.job.sku === draft.sku;
  if (!open) return;
  for (const [i, slot] of withSlotIndex(draft.slots).entries()) {
    if (slot.from === "craft" || slot.from === "huyk") await liveA4(i);
  }
}

function sortStepRows(rows) {
  return rows.sort((a, b) => {
    const ia = Number.isFinite(a.idx) ? a.idx : 999;
    const ib = Number.isFinite(b.idx) ? b.idx : 999;
    return ia - ib;
  });
}

function metaFromClips(clips) {
  const by = new Map();
  const origins = {};
  let finalClips = 0;
  let heroClips = 0;
  for (const c of clips || []) {
    const step = c.craft_step;
    if (step && step !== "hoan_thien" && step !== "__unsorted") {
      const row = by.get(step) || { step, label: c.step_label || step, clips: 0, idx: Number.POSITIVE_INFINITY };
      row.clips += 1;
      if (c.step_label) row.label = c.step_label;
      const idx = Number(c.step_index);
      if (Number.isFinite(idx) && idx < row.idx) row.idx = idx;
      by.set(step, row);
      const origin = c.craft_origin || "legacy";
      const omap = origins[origin] || (origins[origin] = new Map());
      const orow = omap.get(step) || { step, label: row.label, clips: 0, idx: Number.POSITIVE_INFINITY };
      orow.clips += 1;
      if (c.step_label) orow.label = c.step_label;
      if (Number.isFinite(idx) && idx < orow.idx) orow.idx = idx;
      omap.set(step, orow);
    }
    if (c.craft_step === "hoan_thien" || (c.roles?.product_final || 0) >= 0.5) finalClips += 1;
    if ((c.roles?.product_hero || 0) >= 0.5) heroClips += 1;
  }
  const step_detail = sortStepRows([...by.values()]);
  const origin_detail = {};
  for (const [o, map] of Object.entries(origins)) origin_detail[o] = sortStepRows([...map.values()]);
  return {
    step_detail,
    origin_detail,
    step_labels: step_detail.map((x) => x.label),
    steps: step_detail.map((x) => x.step),
    has_final: finalClips > 0,
    final_clips: finalClips,
    hero_clips: heroClips,
  };
}

function paintProductHint() {
  const p = productOf();
  const labels = Array.isArray(p?.step_labels) ? p.step_labels.filter(Boolean) : [];
  const el = $("product-steps");
  if (!el) return;
  if (!p) {
    el.textContent = "Chỉ hiện mã đủ ≥3 công đoạn chế tác.";
    return;
  }
  el.textContent = labels.length
    ? `Công đoạn có footage: ${labels.join(" → ")}${p.has_final ? ` · hoàn thiện ${p.final_clips || 0} clip` : " · chưa có cảnh hoàn thiện"}`
    : `${p.sku} · ${p.clips || 0} clip`;
}

let _metaSeq = 0;
async function fillProductMeta(sku) {
  if (!sku) return;
  const seq = ++_metaSeq;
  try {
    const { clips } = await api.library({ sku, limit: 400 });
    if (seq !== _metaSeq) return;
    const keep = (store.boot.library || []).filter((c) => c.product_set !== sku);
    store.boot.library = [...(clips || []), ...keep];
    store.boot._libSku = sku;
    const p = productOf();
    if (p && (clips || []).length) Object.assign(p, metaFromClips(clips || []));
    paintProductHint();
    paintA4();
  } catch {
    paintProductHint();
  }
}

function showSteps() {
  const p = productOf();
  if (st.a4 && p && st.a4.sku !== p.sku) st.a4 = null;
  if (!p) st.a4 = null;
  paintProductHint();
  paintA4();
  if (p) fillProductMeta(p.sku);
}

async function makeVoice(btn) {
  const script = $("script-input").value.trim();
  if (script.length < 10) { toast("Kịch bản quá ngắn"); return; }
  btn.disabled = true; btn.textContent = "⏳ Đang tạo…";
  try {
    const r = await api.studioVoice({ script, voice: $("omni-voice").value || "", lang: st.lang, content_id: st.content?.id || null });
    st.voice = { ...r, text: script };
    paintVoice();
    $("voice-player").querySelector("audio")?.play().catch(() => {});
  } catch (err) { toast(`Tạo voice: ${err.message}`); } finally { btn.disabled = false; btn.textContent = "🎙 Tạo voice"; }
}

export async function initScriptPanel() {
  $("content-select").addEventListener("change", (e) => pickContent(e.target.value));
  $("lang-select").addEventListener("change", (e) => { st.lang = e.target.value; st.voice = null; applyLang(); });
  $("content-search").addEventListener("input", contentOptions);
  $("script-input").addEventListener("input", paintVoice);
  $("product-select").addEventListener("change", () => { st.a4 = null; showSteps(); });
  $("a4-route").addEventListener("change", onA4Change);
  $("a4-route").addEventListener("click", onA4Click);
  fetch("/api/a4/huyk").then((r) => r.json()).then((d) => {
    st.huyk = d.actions || [];
    if (st.a4 && !(st.a4.huyk || []).some((h) => h?.name)) st.a4 = null;
    paintA4();
  }).catch(() => {});
  $("build-btn").addEventListener("click", () => {
    const useVoice = st.voice && !voiceStale();
    if (st.voice && !useVoice && !confirm("Kịch bản đã sửa sau khi tạo voice. Dựng không dùng voice này (tự lồng tiếng lại)?")) return;
    const line = $("line-select").value;
    const picked = $("template-select").value;
    actions.build({ script: $("script-input").value, sku: $("product-select").value,
      template_id: picked !== "auto" ? picked : "A4",
      line, plan: line === "A4" ? a4Payload() : null, planner: $("planner-select").value, content_id: st.content?.id || null, voice_track: useVoice ? st.voice.audio : null, lang: st.lang,
      preview: true, web_search: $("ill-web").checked, ai_images: $("ill-ai").checked });                               // fast 360p draft while editing; HD from the Xuất menu
  });
  $("aiw-btn").addEventListener("click", (e) => aiWrite(e.currentTarget));
  $("aiw-topic").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("aiw-btn").click(); });
  $("ill-web").addEventListener("change", illusHint);
  $("ill-ai").addEventListener("change", illusHint);
  fetch("/api/web-media/status").then((r) => r.json()).then((w) => {
    $("ill-web").checked = !!w.settings?.auto;
    $("ill-ai").checked = (w.settings?.ai_images || "fill") !== "off" && !!w.gemini;
    $("ill-ai").disabled = !w.gemini;
    if (!w.gemini) $("ill-ai-sub").textContent = "Cần khoá Gemini ở AI › Cài đặt";
    illusHint();
  }).catch(() => {});
  api.content().then((lib) => {
    st.items = lib.items || [];
    contentOptions();
    const q = new URLSearchParams(location.search);
    const want = q.get("content") && st.items.find((c) => c.id === q.get("content"));
    const first = want || st.items.find((c) => c.status === "approved") || st.items[0];
    if (first && !$("content-select").value) pickContent(first.id);
  }).catch(() => { st.items = []; contentOptions(); });
  api.voiceStatus().then((vs) => { st.omni = vs.omni; st.minimax = vs.minimax; paintVoice(); }).catch(() => {});
  const poll = setInterval(async () => {
    if (st.minimax?.voices?.length) return clearInterval(poll);
    await refreshVoices();
    if (st.minimax?.voices?.length) clearInterval(poll);
  }, 5000);
  paintVoice();
  const q = new URLSearchParams(location.search);
  if (q.get("sku") && store.boot.products.some((p) => p.sku === q.get("sku"))) { $("product-select").value = q.get("sku"); showSteps(); }
}

export function renderScriptPanel(s) {
  $("build-btn").disabled = !!s.busy;
  if (s.job?.lang && $("market-chip")) $("market-chip").textContent = s.job.lang.toUpperCase();
}
