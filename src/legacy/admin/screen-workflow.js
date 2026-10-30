// Workflow: khớp Job · tự động — một lịch = một tiếng + một tuyến A1…A5.
// Sơ đồ: lịch → ngôn ngữ & giọng → nhạc → content → footage A4 → dựng → duyệt nháp → AI chấm → đăng → học.
import { api, esc, toast } from "./admin-api.js";

const G = { trig: "g-trig", content: "g-content", build: "g-build", check: "g-check", out: "g-out", learn: "g-learn", warn: "g-warn" };
const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const PFC = { facebook: ["FB", "#1877F2"], instagram: ["IG", "#C13584"], tiktok: ["TT", "#E11D48"] };
const MODE = { library: "Lấy từ Kho content", ai: "AI viết mới", mix: "Kho content, thiếu thì AI viết thêm" };
const NODES = {
  trig: { g: "trig", code: "T", title: "Theo lịch", kind: "Kích hoạt" },
  lang: { g: "content", code: "N", title: "Ngôn ngữ & giọng", kind: "Xuất video" },
  music: { g: "build", code: "♪", title: "Nhạc nền", kind: "Dựng video" },
  content: { g: "content", code: "C", title: "Chọn content", kind: "Nội dung" },
  footage: { g: "build", code: "F", title: "Footage A4", kind: "Dựng video" },
  build: { g: "build", code: "J", title: "Tạo job dựng", kind: "Dựng video" },
  review: { g: "warn", code: "D", title: "Duyệt nháp", kind: "Kiểm duyệt" },
  g2: { g: "warn", code: "G2", title: "Duyệt video", kind: "Kết thúc" },
  check: { g: "check", code: "AI", title: "AI chấm điểm", kind: "Kiểm duyệt · rẽ nhánh", opt: true },
  editor: { g: "warn", code: "TG", title: "Gửi Telegram", kind: "Gửi đi", opt: true },
  publish: { g: "out", code: "L", title: "Lên lịch đăng", kind: "Đăng bài", opt: true },
  post: { g: "out", code: "Đ", title: "Đăng bài", kind: "Đăng bài", opt: true },
  stats: { g: "learn", code: "S", title: "Kéo số liệu", kind: "Học", opt: true },
  learn: { g: "learn", code: "B", title: "Rút bài học", kind: "Học", opt: true },
};
const PALETTE = [
  ["Kích hoạt", "trig", [["trig", "Theo lịch"]]],
  ["Xuất", "content", [["lang", "Ngôn ngữ & giọng"], ["music", "Nhạc nền"]]],
  ["Nội dung", "content", [["content", "Chọn content"]]],
  ["Dựng video", "build", [["footage", "Footage A4"], ["build", "Tạo job dựng"], ["review", "Duyệt nháp"], ["g2", "Duyệt video"]]],
  ["Gửi đi", "warn", [["editor", "Telegram"]]],
  ["Đăng bài", "out", [["publish", "Lên lịch đăng"], ["post", "Đăng bài"], ["check", "AI chấm điểm"]]],
  ["Học", "learn", [["stats", "Kéo số liệu"], ["learn", "Rút bài học"]]],
];
const GROUP_VI = { trig: "Kích hoạt", content: "Xuất", build: "Dựng video", warn: "Gửi đi", out: "Đăng bài", learn: "Học" };
const GROUP_CSS = { "Kích hoạt": "trig", "Xuất & nội dung": "content", "Xuất": "content", "Dựng video": "build", "Gửi đi": "warn", "Đăng bài": "out", "Học": "learn" };
const CSS_CYCLE = ["trig", "content", "build", "warn", "out", "learn"];

function catalog(D) {
  const groups = D?.block_groups || [];
  if (groups.length) {
    const nodes = { ...NODES };
    const palette = [];
    groups.forEach((g, i) => {
      const css = GROUP_CSS[g.title] || CSS_CYCLE[i % CSS_CYCLE.length];
      const list = [];
      for (const b of g.items || []) {
        if (b.enabled === false) continue;
        const key = NODES[b.role] ? b.role : b.id;
        const base = NODES[b.role] || { g: css, opt: true };
        nodes[key] = { g: css, code: b.code || base.code || "?", title: b.title || base.title, kind: b.kind || base.kind || "", opt: NODES[b.role] ? (b.opt != null ? !!b.opt : !!base.opt) : true };
        list.push([key, nodes[key].title]);
      }
      palette.push([g.title, css, list, g.id]);
    });
    return { nodes, palette };
  }
  const rows = (D?.blocks || []).filter((b) => b && b.role && b.enabled !== false)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  if (!rows.length) return { nodes: NODES, palette: PALETTE };
  const nodes = { ...NODES };
  const byG = {};
  for (const b of rows) {
    const base = NODES[b.role] || { g: "build", opt: true };
    nodes[b.role] = { g: b.group || base.g, code: b.code || base.code || "?", title: b.title || base.title, kind: b.kind || base.kind || "", opt: b.opt != null ? !!b.opt : !!base.opt };
    (byG[nodes[b.role].g] ||= []).push([b.role, nodes[b.role].title]);
  }
  const palette = ["trig", "content", "build", "warn", "out", "learn"].filter((g) => byG[g]?.length)
    .map((g) => [GROUP_VI[g] || g, g, byG[g]]);
  return { nodes, palette };
}
const nodeOf = (id) => (S.cat?.nodes || NODES)[id] || NODES[id];
const paletteOf = () => S.cat?.palette || PALETTE;
const famOf = (w) => (w.content?.families && w.content.families[0]) || "A4";
const posting = (w) => !!(w.publish && w.publish.on);
const on = (w, id) => {
  if (id === "footage") return famOf(w) === "A4";
  if (id === "review") return !w.build?.auto_render;
  if (id === "g2") return !posting(w) && !((w.editor || {}).on && (w.editor || {}).telegram);
  if (id === "publish" || id === "post") return posting(w);
  if (id === "check") return !!w.check?.on;
  if (id === "editor") return !!w.editor?.on;
  if (id === "stats") return w.stats && "on" in w.stats ? !!w.stats.on : posting(w);
  if (!NODES[id]) return !!(w.block_on || {})[id];
  return nodeOf(id)?.opt ? !!w[id]?.on : true;
};
let S = { wid: null, sel: "content", view: "flow", chq: "", scrollX: 0, scrollY: 0 };

function itemCore(id) {
  return !nodeOf(id)?.opt && id !== "review" && id !== "g2" && id !== "footage";
}

const ICO_PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';
const ICO_MINUS = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 12h14"/></svg>';

function itemRowHtml() {
  return `<div class="ge-i">
      <label class="small" style="flex:1;min-width:120px">Tên mục<input class="in" data-it placeholder="VD. Gửi Zalo"></label>
      <label class="small">Mã<input class="in mono" data-ic maxlength="4" placeholder="Z" style="width:56px"></label>
      <label class="small" style="flex:1;min-width:80px">Loại<input class="in" data-ik placeholder="Gửi đi"></label>
      <button class="ge-ico minus" type="button" data-del-i title="Bỏ mục" aria-label="Bỏ mục">${ICO_MINUS}</button>
      <button class="ge-ico plus" type="button" data-add-i title="Thêm mục" aria-label="Thêm mục">${ICO_PLUS}</button>
    </div>`;
}

function groupCardHtml(first) {
  return `<article class="ge-g">
      <div class="ge-title">
        <label class="small" style="flex:1">Tên khối<input class="in" data-gt placeholder="VD. Gửi khách"></label>
        ${first ? "" : `<button class="ge-ico minus" type="button" data-del-g title="Xoá khối" aria-label="Xoá khối">${ICO_MINUS}</button>`}
        <button class="ge-ico plus" type="button" data-add-g title="Thêm khối" aria-label="Thêm khối">${ICO_PLUS}</button>
      </div>
      <div data-items>${itemRowHtml()}</div>
    </article>`;
}

function readDraftItems(box) {
  return [...(box?.querySelectorAll(".ge-i") || [])].map((row) => ({
    title: (row.querySelector("[data-it]")?.value || "").trim(),
    code: (row.querySelector("[data-ic]")?.value || "").trim(),
    kind: (row.querySelector("[data-ik]")?.value || "").trim(),
  })).filter((x) => x.title);
}

function asList(res, key) {
  if (!res) return [];
  if (Array.isArray(res[key])) return res[key];
  if (res.id || res.title) return [res];
  return [];
}

function itemKey(b) {
  return NODES[b.role] ? b.role : b.id;
}

function pickGroupHtml(name, list, selected, gid) {
  const items = list.map(([id, l]) => {
    const core = itemCore(id);
    const chk = core || selected.has(id);
    return `<label class="small wf-pick-i"><input type="checkbox" data-nid="${esc(id)}" ${chk ? "checked" : ""} ${core ? "disabled" : ""}> ${esc(l)}${core ? " · bắt buộc" : ""}</label>`;
  }).join("");
  return `<div class="wf-pick-g" data-open="1"${gid ? ` data-gid="${esc(gid)}"` : ""}>
      <div class="wf-pick-h">
        <button class="btn sm icon" type="button" data-exp aria-expanded="true" title="Xem mục">▾</button>
        <label class="small" style="flex:1;display:flex;align-items:center;gap:6px"><input type="checkbox" data-gchk> <b>${esc(name)}</b></label>
        ${gid ? `<button class="ge-ico plus" type="button" data-add-i title="Thêm mục" aria-label="Thêm mục">${ICO_PLUS}</button>` : ""}
      </div>
      <div class="wf-pick-items">${items || '<span class="small muted">Chưa có mục</span>'}</div>
    </div>`;
}

function bindPick(wrap, { onYes }) {
  wrap.style.cssText = "position:fixed;inset:0;z-index:70";
  const sync = (g) => {
    const boxes = [...g.querySelectorAll("[data-nid]:not(:disabled)")];
    const gc = g.querySelector("[data-gchk]");
    if (!gc) return;
    if (!boxes.length) { gc.checked = false; gc.disabled = !g.querySelector(".ge-i"); gc.indeterminate = false; return; }
    const n = boxes.filter((b) => b.checked).length;
    gc.disabled = false;
    gc.checked = n === boxes.length;
    gc.indeterminate = n > 0 && n < boxes.length;
  };
  wrap.querySelectorAll(".wf-pick-g").forEach(sync);
  wrap.addEventListener("change", (e) => {
    const g = e.target.closest(".wf-pick-g");
    if (!g) return;
    if (e.target.hasAttribute("data-gchk")) {
      g.querySelectorAll("[data-nid]:not(:disabled)").forEach((b) => { b.checked = e.target.checked; });
    }
    sync(g);
  });
  wrap.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (e.target.closest("[data-no]") || e.target.classList.contains("scrim")) { wrap.remove(); onYes(null); return; }
    const exp = e.target.closest("[data-exp]");
    if (exp) {
      const g = exp.closest(".wf-pick-g");
      const open = g.dataset.open === "1";
      g.dataset.open = open ? "0" : "1";
      exp.textContent = open ? "▸" : "▾";
      exp.setAttribute("aria-expanded", open ? "false" : "true");
      g.querySelector(".wf-pick-items").hidden = open;
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-add-g")) {
      const card = b.closest(".ge-g");
      const html = groupCardHtml(false);
      if (card) card.insertAdjacentHTML("afterend", html);
      else wrap.querySelector("[data-glist]").insertAdjacentHTML("beforeend", html);
      (card?.nextElementSibling || wrap.querySelector(".ge-g:last-child"))?.querySelector("[data-gt]")?.focus();
      return;
    }
    if (b.hasAttribute("data-add-i")) {
      const row = b.closest(".ge-i");
      if (row) { row.insertAdjacentHTML("afterend", itemRowHtml()); row.nextElementSibling?.querySelector("input")?.focus(); return; }
      const g = b.closest(".wf-pick-g");
      const box = g?.querySelector(".wf-pick-items");
      if (box) {
        box.insertAdjacentHTML("beforeend", itemRowHtml());
        box.querySelector(".ge-i:last-child input")?.focus();
        g.dataset.open = "1";
        g.querySelector(".wf-pick-items").hidden = false;
        const expBtn = g.querySelector("[data-exp]");
        if (expBtn) { expBtn.textContent = "▾"; expBtn.setAttribute("aria-expanded", "true"); }
      }
      return;
    }
    if (b.hasAttribute("data-del-g")) { b.closest(".ge-g")?.remove(); return; }
    if (b.hasAttribute("data-del-i")) {
      const box = b.closest("[data-items]") || b.closest(".wf-pick-items");
      const rows = box?.querySelectorAll(".ge-i") || [];
      if (b.closest(".wf-pick-g") && rows.length < 2) { b.closest(".ge-i")?.remove(); return; }
      if (rows.length < 2) { b.closest(".ge-i").querySelectorAll("input").forEach((i) => { i.value = ""; }); return; }
      b.closest(".ge-i")?.remove();
      return;
    }
    if (!b.hasAttribute("data-yes")) return;
    await onYes(wrap);
  });
}

function newWorkflowPopup(host, defaultName, palette) {
  const groups = palette?.length ? palette : PALETTE;
  const preset = new Set(["footage", "g2"]);
  const groupHtml = groups.map(([name, , list]) => pickGroupHtml(name, list, preset, "")).join("");
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="scrim" data-no></div>
      <div class="box pad xmodal wide" role="dialog" aria-modal="true">
        <b>Workflow mới</b>
        <label class="small">Tên<input class="in" id="wf-new-name" value="${esc(defaultName)}" style="margin-top:4px"></label>
        <span class="small muted">Mở khối để tick từng mục. Tick khối = tick hết mục trong khối; vẫn có thể bỏ từng mục.</span>
        <div class="wf-pick">${groupHtml}</div>
        <div class="ge-actions">
          <button class="btn" type="button" data-no>Huỷ</button>
          <button class="btn pri" type="button" data-yes>Tạo workflow</button>
        </div>
      </div>`;
    bindPick(wrap, {
      onYes: (node) => {
        if (!node) { resolve(null); return; }
        const ids = [...node.querySelectorAll("[data-nid]")].filter((x) => x.checked).map((x) => x.dataset.nid);
        resolve({ name: (node.querySelector("#wf-new-name").value || defaultName).trim().slice(0, 60), ids });
        node.remove();
      },
    });
    host.append(wrap);
    wrap.querySelector("#wf-new-name")?.focus();
  });
}

function editPalettePopup(host, palette, selected) {
  const groups = palette?.length ? palette : PALETTE;
  const groupHtml = groups.map(([name, , list, gid]) => pickGroupHtml(name, list, selected, gid || "")).join("");
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="scrim" data-no></div>
      <div class="box pad xmodal wide" role="dialog" aria-modal="true">
        <b>Sửa khối</b>
        <span class="small muted">Tick để chọn lại mục trên rail trái. Cộng cạnh khối để thêm mục; cộng cạnh tên khối mới để thêm khối.</span>
        <div class="wf-pick">${groupHtml}
          <div class="ge-title">
            <span class="small muted" style="flex:1">Thêm khối mới</span>
            <button class="ge-ico plus" type="button" data-add-g title="Thêm khối" aria-label="Thêm khối">${ICO_PLUS}</button>
          </div>
          <div data-glist></div>
        </div>
        <div class="ge-actions">
          <button class="btn" type="button" data-no>Huỷ</button>
          <button class="btn pri" type="button" data-yes>Lưu khối</button>
        </div>
      </div>`;
    bindPick(wrap, {
      onYes: async (node) => {
        if (!node) { resolve(null); return; }
        const ids = [...node.querySelectorAll("[data-nid]")].filter((x) => x.checked).map((x) => x.dataset.nid);
        const extra = [];
        for (const g of node.querySelectorAll(".wf-pick-g[data-gid]")) {
          const draft = readDraftItems(g.querySelector(".wf-pick-items"));
          if (!draft.length) continue;
          extra.push({ gid: g.dataset.gid, items: draft });
        }
        const groupsNew = [...node.querySelectorAll(".ge-g")].map((card) => ({
          title: (card.querySelector("[data-gt]")?.value || "").trim(),
          items: readDraftItems(card.querySelector("[data-items]")),
        })).filter((g) => g.title);
        node.remove();
        resolve({ ids, extra, groups: groupsNew });
      },
    });
    host.append(wrap);
  });
}

function applyPicksToWorkflow(w, ids) {
  const set = new Set(ids || []);
  const telegram = set.has("editor");
  const publish = set.has("publish") || set.has("post");
  if (set.has("footage")) { w.content.families = ["A4"]; w.a4_line = true; }
  else { if (famOf(w) === "A4") w.content.families = ["A1"]; w.a4_line = false; }
  w.build = { ...(w.build || {}), auto_render: !set.has("review") };
  w.check = { ...(w.check || {}), on: set.has("check") };
  w.editor = { ...(w.editor || {}), on: telegram, telegram };
  w.publish = { ...(w.publish || {}), on: publish };
  w.learn = { ...(w.learn || {}), on: set.has("learn") };
  w.stats = { ...(w.stats || {}), on: set.has("stats") };
  const block_on = {};
  for (const id of set) if (!NODES[id]) block_on[id] = true;
  w.block_on = block_on;
}

function workflowFromPicks(picks) {
  const ids = new Set(picks.ids || []);
  const w = {
    name: picks.name || "Workflow mới",
    enabled: false,
    trigger: { times: ["08:00"], days: [0, 1, 2, 3, 4, 5, 6] },
    content: { count: 5, families: ["A1"], topics: [], mode: "mix", skus: [] },
    lang: "vi", voice: "", music_track: "", a4_line: false, a4_plan: null,
    build: { auto_render: true, hook_text: false },
    check: { on: false, threshold: 60 },
    editor: { on: false, telegram: false },
    publish: { on: false, target: "market", channels: [], approve_pass: "auto" },
    learn: { on: false },
    stats: { on: false },
    block_on: {},
  };
  applyPicksToWorkflow(w, ids);
  return w;
}

function askPopup(host, { title, text, ok = "Xác nhận", cancel = "Huỷ", danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="scrim" data-no></div>
      <div class="box pad xmodal" role="dialog" aria-modal="true" aria-labelledby="wf-ask-t">
        <b id="wf-ask-t">${esc(title)}</b>
        <p class="small" style="margin:0;line-height:1.45">${esc(text)}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn" type="button" data-no>${esc(cancel)}</button>
          <button class="btn ${danger ? "danger" : "pri"}" type="button" data-yes>${esc(ok)}</button>
        </div>
      </div>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener("click", (e) => {
      if (e.target.closest("[data-yes]")) done(true);
      else if (e.target.closest("[data-no]")) done(false);
    });
    host.append(wrap);
    wrap.querySelector("[data-yes]")?.focus();
  });
}

function layout(w) {
  const main = ["trig", "lang", "music", "content", ...(on(w, "footage") ? ["footage"] : []), "build",
    ...(on(w, "review") ? ["review"] : []), ...(on(w, "g2") ? ["g2"] : []),
    ...(on(w, "editor") && !on(w, "check") ? ["editor"] : []),
    ...(on(w, "check") ? ["check"] : []), ...(on(w, "publish") ? ["publish", "post"] : []),
    ...(on(w, "stats") ? ["stats"] : [])];
  const extra = Object.keys(S.cat?.nodes || {}).filter((id) => !NODES[id] && on(w, id));
  main.push(...extra);
  const pos = {};
  main.forEach((id, i) => { pos[id] = { x: 30 + i * 230, y: 150 }; });
  if (on(w, "check") && on(w, "editor")) pos.editor = { x: pos.check.x + 115, y: 380 };
  if (on(w, "learn") && pos.stats) pos.learn = { x: pos.stats.x - 230, y: 380 };
  return { main, pos, width: 30 + main.length * 230 + 60 };
}

function status(w, id) {
  const r = (w.runs || [])[0], st = w.stats || {};
  const v = (t, cls = "ok") => [t, cls];
  if (id === "trig") return r ? v(`Chạy ${r.started_at.slice(5, 16)}`) : v(w.enabled ? "Chờ lần chạy đầu" : "Đang tắt", "wait");
  if (id === "lang") return v((w.lang || "vi").toUpperCase(), "ok");
  if (id === "music") return v(w.music_track ? "Bài đã chọn" : "Random mỗi video", w.music_track ? "ok" : "wait");
  if (id === "content") return r ? v(`${r.requested || 0} video yêu cầu`) : v("—", "wait");
  if (id === "footage") return v(w.a4_line !== false ? "Khóa công đoạn A4" : "Không khóa tuyến", w.a4_line !== false ? "ok" : "wait");
  if (id === "build") return r ? v(`${r.jobs?.length ?? r.jobs ?? 0} job · ${(r.errors || []).length || 0} lỗi`, (r.errors || []).length ? "warn" : "ok") : v("—", "wait");
  if (id === "review") return v("Cột Nháp trên Job · tự động", "wait");
  if (id === "g2") return v("Vào mục Duyệt · không đăng, không Telegram", "ok");
  if (id === "check") return v(`Điểm dự đoán ≥ ${w.check.threshold}`, "ok");
  if (id === "editor") return v(w.editor?.telegram ? "Gửi vào nhóm Telegram khi HD xong" : "Không gửi Telegram", w.editor?.telegram ? "ok" : "wait");
  if (id === "publish") return v(`${st.scheduled || 0} chờ giờ đăng`, "ok");
  if (id === "post") return v(`${st.published || 0} đã đăng${st.error ? ` · ${st.error} lỗi` : ""}`, st.error ? "warn" : "ok");
  if (id === "stats") return v("Mỗi 6 giờ", "wait");
  if (id === "learn") return v("Sau mỗi lần kéo số liệu", "wait");
  return v("", "wait");
}

function sub(w, id, D) {
  const c = w.content;
  const fam = famOf(w);
  const track = (D.music || []).find((m) => m.id === w.music_track);
  const voice = (D.voices || []).find((v) => v.id === w.voice);
  if (id === "trig") return `${w.trigger.times.join(", ") || "chưa có giờ"} · ${w.trigger.days.length === 7 ? "hằng ngày" : w.trigger.days.map((d) => DAYS[d]).join(" ")}`;
  if (id === "lang") return `${(w.lang || "vi").toUpperCase()} · ${voice ? (voice.label || voice.id) : "giọng HuyK tự chọn theo tiếng"}`;
  if (id === "music") return track ? track.name : "Bỏ trống = mỗi video một bài khác";
  if (id === "content") return `${c.count} bài · ${fam} · ${c.mode === "ai" ? "AI viết" : c.mode === "library" ? "Kho content" : "Kho + AI"}`;
  if (id === "footage") return w.a4_line !== false ? "Sản phẩm → HuyK → chế tác → thành phẩm · thời lượng theo lời đọc" : "Tắt khóa tuyến — footage theo kịch bản";
  if (id === "build") return `${w.build.auto_render ? "Dựng + xuất HD ngay" : "Tạo nháp, chờ duyệt"} · template A4`;
  if (id === "review") return "Người duyệt tích job rồi bấm Duyệt & render";
  if (id === "g2") return "Chờ người xem ở Duyệt. Không đăng MXH, không gửi Telegram.";
  if (id === "check") return "Đúng: lên lịch · Sai: chờ Editor";
  if (id === "editor") return w.editor.telegram ? "Gửi video vào nhóm Telegram" : "Chờ duyệt trong Lịch đăng";
  if (id === "publish") return w.publish.target === "market" ? "Mọi kênh cùng ngôn ngữ video" : `${(w.publish.channels || []).length} kênh đã chọn`;
  if (id === "post") return "FB Reels · Instagram · TikTok hộp thư";
  if (id === "stats") return `Content win ≥ ${(D.win || 100000).toLocaleString(globalThis.VCB_LOC || "vi-VN")} view`;
  if (id === "learn") return "Bài học → AI viết & AI chia cảnh";
  return "";
}

function canvas(w, D) {
  const { main, pos, width } = layout(w);
  const W = 196, PY = 45;
  const curve = (a, b) => { const x1 = a.x + W, y1 = a.y + PY, x2 = b.x, y2 = b.y + PY, dx = Math.max(50, Math.abs(x2 - x1) / 2); return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`; };
  const edges = main.slice(1).map((id, i) => `<path d="${curve(pos[main[i]], pos[id])}" class="wf-e"></path>`);
  const labels = [];
  if (pos.editor) {
    const c = pos.check, e = pos.editor, p = pos.publish;
    edges.push(`<path d="M${c.x + W / 2} ${c.y + 118} C${c.x + W / 2} ${c.y + 200}, ${e.x + W / 2} ${e.y - 60}, ${e.x + W / 2} ${e.y}" class="wf-e warn"></path>`);
    edges.push(`<path d="M${e.x + W} ${e.y + PY} C${e.x + W + 80} ${e.y + PY}, ${p.x + W / 2} ${p.y + 200}, ${p.x + W / 2} ${p.y + 118}" class="wf-e warn"></path>`);
    labels.push(`<span class="wf-l ok" style="left:${c.x + W + 6}px;top:${c.y + 20}px">Đúng</span>`, `<span class="wf-l warn" style="left:${c.x + W / 2 + 8}px;top:${c.y + 150}px">Sai</span>`);
  }
  if (pos.learn) {
    const s = pos.stats, l = pos.learn, c = pos.content;
    edges.push(`<path d="M${s.x + W / 2} ${s.y + 118} C${s.x + W / 2} ${l.y + PY}, ${l.x + W + 60} ${l.y + PY}, ${l.x + W} ${l.y + PY}" class="wf-e loop"></path>`);
    edges.push(`<path d="M${l.x} ${l.y + PY + 20} C${l.x - 400} ${l.y + 150}, ${c.x + W / 2} ${c.y + 330}, ${c.x + W / 2} ${c.y + 118}" class="wf-e loop"></path>`);
    labels.push(`<span class="wf-l ok" style="left:${c.x + 140}px;top:${l.y + 110}px">Vòng học: bài học quay lại khâu chọn &amp; viết content</span>`);
  }
  const nodes = Object.keys(pos).map((id) => {
    const n = nodeOf(id), [stt, cls] = status(w, id);
    if (!n) return "";
    return `<button type="button" class="wf-n${S.sel === id ? " on" : ""}" data-node="${id}" style="left:${pos[id].x}px;top:${pos[id].y}px">
      <span class="wf-h"><span class="wf-c ${G[n.g]}">${n.code}</span><b>${n.title}</b></span>
      <span class="wf-s">${esc(sub(w, id, D))}</span><span class="wf-st ${cls}"><i></i>${esc(stt)}</span>
      <span class="wf-p pin"></span><span class="wf-p out"></span></button>`;
  }).join("");
  return `<section class="wf-canvas" aria-label="Sơ đồ workflow. Nhấn giữ rồi kéo để xem các khối."><div class="wf-inner" style="width:${width}px">
      <svg width="${width}" height="560" aria-hidden="true">${edges.join("")}</svg>${labels.join("")}${nodes}</div></section>`;
}

function chips(list, cur, attr) {
  return `<span class="wf-chips">${list.map(([v, l]) => `<button type="button" class="wf-chip" aria-pressed="${cur.includes(v)}" ${attr}="${esc(v)}">${esc(l)}</button>`).join("")}</span>`;
}
function oneChip(list, cur, attr) {
  return `<span class="wf-chips">${list.map(([v, l]) => `<button type="button" class="wf-chip" aria-pressed="${cur === v}" ${attr}="${esc(v)}">${esc(l)}</button>`).join("")}</span>`;
}

function inspector(w, D) {
  const id = S.sel, n = nodeOf(id);
  if (!n) return "";
  const f = (label, body, hint) => `<div class="wf-f"><span class="lbl">${label}</span>${body}${hint ? `<span class="small muted">${hint}</span>` : ""}</div>`;
  const fam = famOf(w);
  let body = "";
  if (id === "trig") body = f("Giờ chạy", `<input class="in mono" data-k="trigger.times" value="${esc(w.trigger.times.join(", "))}" placeholder="08:00, 14:00">`, "Nhiều giờ cách nhau dấu phẩy")
    + f("Ngày trong tuần", chips(DAYS.map((d, i) => [String(i), d]), w.trigger.days.map(String), "data-day"));
  if (id === "lang") {
    const langs = D.languages || [{ code: "vi", label: "Tiếng Việt" }];
    const voices = D.voices || [];
    body = f("Ngôn ngữ xuất", oneChip(langs.map((l) => [l.code, `${l.code.toUpperCase()} ${l.label}`]), w.lang || "vi", "data-lang"),
      "Một workflow = một tiếng (lời HuyK + phụ đề đúng tiếng đó). Muốn thêm tiếng khác thì tạo workflow mới. Outro HuyK và logo chỉ trên bản tiếng Việt.")
      + f("Giọng đọc", `<select class="in" data-k="voice"><option value="" ${!w.voice ? "selected" : ""}>Tự động theo ngôn ngữ (HuyK chuẩn từng thứ tiếng)</option>
        ${voices.map((v) => `<option value="${esc(v.id)}" ${w.voice === v.id ? "selected" : ""}>${esc(v.label || v.id)}${v.lang ? ` (${esc(String(v.lang).toUpperCase())})` : ""}</option>`).join("")}</select>`,
      "Để trống = HuyK VN / USA / TH… theo tiếng xuất.");
  }
  if (id === "music") body = f("Nhạc nền", `<select class="in" data-k="music_track">
      <option value="" ${!w.music_track ? "selected" : ""}>Bỏ trống · random mỗi video</option>
      ${(D.music || []).map((m) => `<option value="${esc(m.id)}" ${w.music_track === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
    </select>`, "Không chọn = mỗi video bốc một bài khác trong kho Nhạc. Chọn một bài thì mọi video dùng bài đó.");
  if (id === "content") body = f("Số video mỗi lần", `<input class="in mono" type="number" min="1" max="50" data-k="content.count" value="${w.content.count}" style="width:100px">`)
    + f("Tuyến content", oneChip(Object.keys(D.families).map((k) => [k, D.families[k]]), fam, "data-fam"),
      "Một workflow = một tuyến (A1…A5). Chọn A4 mới khóa footage theo công đoạn chế tác.")
    + f("Nguồn", `<select class="in" data-k="content.mode">${Object.entries(MODE).map(([k, l]) => `<option value="${k}" ${w.content.mode === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)
    + f("Chủ đề", `<span class="wf-list">${D.topics.map((t) => `<label class="small"><input type="checkbox" class="chk" data-topic="${esc(t)}" ${w.content.topics.includes(t) ? "checked" : ""}> ${esc(t)}</label>`).join("")}</span>`, "Không chọn = mọi chủ đề")
    + f("Mã sản phẩm", `<span class="small">${(w.content.skus || []).length ? (w.content.skus || []).join(", ") : "Không chọn = xoay vòng mọi mã đủ footage. Thêm mã ở Kho hàng › đưa vào workflow."}</span>`);
  if (id === "footage") body = f("Khóa tuyến A4", `<label class="small"><input type="checkbox" class="chk" data-b="a4_line" ${w.a4_line !== false ? "checked" : ""}> Footage theo tuyến A4 (công đoạn chế tác)</label>`,
    "Khóa thứ tự: Sản phẩm → HuyK → các công đoạn chế tác → thành phẩm. Thời lượng theo lời đọc; clip ngắn thì bốc clip khác trám. Outro + logo chỉ bản tiếng Việt.")
    + f("Công thức", '<span class="small">Một template A4 · 9 khối. Sửa chi tiết ô cảnh (công đoạn / HuyK) ở Job · tự động khi chạy lịch này.</span>');
  if (id === "build") body = f("Sau khi tạo job", `<label class="small"><input type="checkbox" class="chk" data-b="build.auto_render" ${w.build.auto_render ? "checked" : ""}> Dựng và xuất HD ngay (bỏ bước Duyệt nháp)</label>`,
    "Tắt = job vào cột Nháp. Bật = dựng HD rồi đưa vào mục Duyệt. Không tự đăng bài trừ khi bật khối Lên lịch đăng.")
    + f("Chữ đầu video", `<label class="small"><input type="checkbox" class="chk" data-b="build.hook_text" ${w.build.hook_text ? "checked" : ""}> Hiện câu hook trên màn hình</label>`)
    + f("Template", '<span class="small">A4 · Công thức chế tác. Thời lượng từng ô theo lời đọc, không set sẵn số giây.</span>');
  if (id === "review") body = f("Việc cần làm", '<span class="small">Job nằm ở Job · tự động › Nháp. Duyệt từng cái hoặc Chọn nhiều › Duyệt &amp; render HD.</span>')
    + f("Bỏ bước này", '<span class="small">Bật “Dựng và xuất HD ngay” ở khối Tạo job dựng — video HD sẽ vào mục Duyệt.</span>');
  if (id === "g2") body = f("Đích đến", '<span class="small">Video HD nằm ở <a href="#/review">Duyệt</a>. Không đăng Facebook / Instagram / TikTok. Không gửi Telegram.</span>');
  if (id === "check") body = f("Điều kiện", `<span style="display:flex;gap:8px;align-items:center">Điểm dự đoán ≥ <input class="in mono" type="number" min="0" max="100" data-k="check.threshold" value="${w.check.threshold}" style="width:80px"></span>`,
    "Điểm dự đoán = điểm trung bình các video cùng tuyến trên kênh (cần ≥ 3 video có số liệu, chưa đủ thì tính là Sai)")
    + f("Đúng", '<span class="small">Lên lịch đăng ngay theo giờ từng kênh</span>') + f("Sai", `<span class="small">${on(w, "editor") ? "Chờ Editor duyệt" : "Vẫn lên lịch (khối Editor duyệt đang tắt)"}</span>`);
  if (id === "editor") body = f("Telegram", `<label class="small"><input type="checkbox" class="chk" data-b="editor.telegram" ${w.editor.telegram ? "checked" : ""}> Gửi video vào nhóm khi HD xong</label>`, "Không đăng MXH. File > 50 MB Telegram từ chối.");
  if (id === "publish") {
    const chs = D.channels.filter((c) => !S.chq || c.name.toLowerCase().includes(S.chq.toLowerCase()));
    body = f("Đăng lên", `<span class="wf-chips"><button type="button" class="wf-chip" aria-pressed="${w.publish.target === "market"}" data-target="market">Mọi kênh cùng ngôn ngữ</button><button type="button" class="wf-chip" aria-pressed="${w.publish.target === "channels"}" data-target="channels">Chọn kênh</button></span>`,
      "Video tiếng nào chỉ lên kênh có thị trường nói tiếng đó")
      + (w.publish.target === "channels" ? f(`Kênh · ${w.publish.channels.length} đã chọn`, `<input class="in" id="wf-chq" type="search" placeholder="Tìm kênh" value="${esc(S.chq)}">
        <span style="display:flex;gap:6px"><button class="btn sm" type="button" data-chall>Chọn tất cả</button><button class="btn sm" type="button" data-chnone>Bỏ chọn</button></span>
        <span class="wf-list">${chs.map((c) => `<label class="small"><input type="checkbox" class="chk" data-ch="${esc(c.cid)}" ${w.publish.channels.includes(c.cid) ? "checked" : ""}> <span class="pfchip" style="background:${(PFC[c.platform] || PFC.facebook)[1]}">${(PFC[c.platform] || PFC.facebook)[0]}</span> ${esc(c.name)} <span class="muted mono">${esc((c.market || "").toUpperCase())}</span></label>`).join("") || '<span class="small muted">Chưa có kênh — vào Đăng &amp; hiệu quả › Kết nối</span>'}</span>`) : "")
      + f("Giờ đăng", '<span class="small">Khung giờ trống tiếp theo theo lịch từng kênh (Đăng &amp; hiệu quả › Lịch đăng), không đăng lại video đã có trên kênh</span>');
  }
  if (id === "post") body = f("Cách đăng", '<span class="small">Facebook Reels và Instagram đăng thẳng đúng giờ. TikTok gửi vào hộp thư, anh bấm đăng trong app. Caption lấy từ content + hashtag theo ngôn ngữ.</span>');
  if (id === "stats") body = f("Kéo số liệu", '<span class="small">Tự kéo mỗi 6 giờ cho mọi page đã kết nối (lượt xem, thời gian xem, tương tác).</span>')
    + f("Content win", `<span class="small">Từ ${(D.win || 100000).toLocaleString(globalThis.VCB_LOC || "vi-VN")} view · đổi ở Đăng &amp; hiệu quả › Hiệu quả</span>`);
  if (id === "learn") body = f("Áp dụng vào", '<span class="small">AI rút bài học sau mỗi lần kéo số liệu: bài học Content / Hook vào AI viết content, template A4 / độ dài vào cách ghép cảnh.</span>');
  const [stt, cls] = status(w, id);
  return `<div class="wf-ih"><span class="wf-c ${G[n.g]}">${n.code}</span><span class="chn"><b>${n.title}</b><span class="small muted">${n.kind}</span></span>
      ${n.opt ? `<button class="btn sm danger" type="button" data-off="${id}" title="Bỏ khối này khỏi sơ đồ">Bỏ khối</button>` : ""}</div>
    <div class="wf-ib">${body}<div class="wf-last"><span class="lbl">Lần chạy gần nhất</span><span class="wf-st ${cls}"><i></i>${esc(stt)}</span></div></div>`;
}

function runsView(w) {
  const rs = w.runs || [];
  return `<section class="wf-runs">${rs.length ? rs.map((r) => `<div class="box wf-run"><span class="mono small" style="width:120px">${esc((r.started_at || "").slice(5, 16))}</span>
      <span class="chip ${r.state === "done" ? "ok" : r.state === "running" ? "run" : "bad"}">${r.state === "done" ? "Xong" : r.state === "running" ? "Đang chạy" : "Lỗi"}</span>
      <span class="chn"><span>${r.requested || 0} video yêu cầu · ${(r.jobs?.length ?? r.jobs) || 0} job tạo${r.stats?.done != null ? ` · ${r.stats.done} xong` : ""}</span>
        ${(r.errors || []).length ? `<span class="small" style="color:var(--warn)">${esc(String((r.errors || [])[0]).slice(0, 160))}${r.errors.length > 1 ? ` · +${r.errors.length - 1} lỗi` : ""}</span>` : ""}</span>
      <span class="mono small muted">${r.stats?.elapsed_s ? Math.round(r.stats.elapsed_s / 60) + " phút" : ""}</span><a class="btn sm" href="#/jobs">Xem job</a></div>`).join("")
    : '<div class="empty">Workflow này chưa chạy lần nào. Bấm "Chạy thử" để chạy ngay.</div>'}</section>`;
}

export async function render(view, ctx) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;height:100vh";
  view.replaceChildren(el);
  let D = await api.workflows();
  try { D.win = (await api.social()).settings.win_views; } catch { D.win = 100000; }
  let w = null, dirty = false;
  const pick = () => {
    S.cat = catalog(D);
    if (!D.workflows.length) { w = null; return; }
    const cur = D.workflows.find((x) => x.id === S.wid) || D.workflows[0];
    S.wid = cur.id;
    w = JSON.parse(JSON.stringify(cur));
    w.lang = w.lang || (w.translate?.langs && w.translate.langs[0]) || "vi";
    w.content.families = [(w.content.families || ["A4"])[0] || "A4"];
  };
  pick();
  const header = () => `<header class="ph-bar"><h1>Workflow</h1>
    ${D.workflows.length ? `<select class="in" id="wf-pick" style="width:auto;min-height:34px;font-weight:600" aria-label="Chọn workflow">${D.workflows.map((x) => `<option value="${x.id}" ${x.id === S.wid ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
      <input class="in" id="wf-name" value="${esc(w.name)}" aria-label="Tên workflow" style="width:220px;min-height:34px">` : ""}
    <button class="btn" type="button" data-new>+ Workflow mới</button>
    ${w ? `<nav class="seg" aria-label="Chế độ xem"><button type="button" aria-pressed="${S.view === "flow"}" data-view="flow">Sơ đồ</button><button type="button" aria-pressed="${S.view === "runs"}" data-view="runs">Lịch sử chạy · ${(w.runs || []).length}</button></nav>` : ""}
    <div class="sp"></div>
    ${w ? `<span class="small muted">${w.enabled ? `Chạy lúc ${esc(w.trigger.times.join(", "))} · ${(w.lang || "vi").toUpperCase()} · ${esc(famOf(w))}` : "Đang tắt"}</span>
      <span class="small muted" style="display:flex;gap:8px;align-items:center">Đang chạy <button class="switch" type="button" role="switch" aria-checked="${w.enabled}" data-enable aria-label="Bật workflow"></button></span>
      <button class="btn" type="button" data-run>▶ Chạy thử</button><button class="btn pri" type="button" data-save>${dirty ? "Lưu thay đổi" : "Đã lưu"}</button>
      <button class="btn icon danger" type="button" data-del aria-label="Xoá workflow" title="Xoá workflow">✕</button>` : ""}</header>`;
  const palette = () => {
    if (!w) return "";
    const groups = paletteOf().map(([name, g, list]) => `<div class="wf-pg"><span class="wf-pgt">${name}</span>
      ${list.map(([id, l]) => {
        const n = nodeOf(id);
        if (!n) return "";
        const has = on(w, id);
        const core = !n.opt && id !== "review" && id !== "g2" && id !== "footage";
        return `<button type="button" class="wf-pi${has ? " has" : ""}" data-add="${id}" title="${has ? (core ? "Đang dùng" : "Bấm để gỡ khỏi sơ đồ") : "Bấm để thêm vào sơ đồ"}">
        <span class="wf-c ${G[n.g] || G[g]}">${esc(n.code)}</span><span class="ell">${esc(l)}</span><span class="small">${has ? "✓" : ""}</span></button>`;
      }).join("")}</div>`).join("");
    return `<aside class="wf-pal" aria-label="Thêm khối"><div class="wf-pal-h">
        <span class="wf-pgt">Thêm khối</span>
        <button class="btn sm" type="button" data-edit-pal>Sửa</button>
      </div>
      ${groups}
      <p class="small muted" style="margin:4px 2px 0;line-height:1.5">✓ đang làm · ô trống = chưa dùng. Sửa = chọn lại hoặc thêm khối/mục mới.</p></aside>`;
  };
  const paint = () => {
    if (!w) {
      el.innerHTML = header() + `<div class="page"><div class="empty" style="display:grid;gap:12px;justify-items:center;padding:60px">
        <b style="font-size:16px">Chưa có workflow nào</b><span class="muted">Luồng: lịch → ngôn ngữ &amp; giọng → nhạc → content → footage A4 → dựng nháp → duyệt → đăng → số liệu.</span>
        <button class="btn pri" type="button" data-new>+ Tạo workflow đầu tiên</button></div></div>`;
      return;
    }
    el.innerHTML = header() + `<div class="wf">${palette()}${S.view === "flow" ? canvas(w, D) : runsView(w)}<aside class="wf-insp" id="wf-insp">${inspector(w, D)}</aside></div>`;
    restoreScroll();
  };
  const restoreScroll = () => {
    const cv = el.querySelector(".wf-canvas");
    if (cv) { cv.scrollLeft = S.scrollX || 0; cv.scrollTop = S.scrollY || 0; }
  };
  const rememberScroll = () => {
    const cv = el.querySelector(".wf-canvas");
    if (!cv) return;
    S.scrollX = cv.scrollLeft;
    S.scrollY = cv.scrollTop;
  };
  const repaintSoft = () => {
    rememberScroll();
    el.querySelector("header").outerHTML = header();
    const pal = el.querySelector(".wf-pal"); if (pal) pal.outerHTML = palette();
    const cv = el.querySelector(".wf-canvas");
    if (cv) cv.outerHTML = canvas(w, D);
    restoreScroll();
    const ins = el.querySelector("#wf-insp"); if (ins) ins.innerHTML = inspector(w, D);
  };
  const touch = () => { dirty = true; repaintSoft(); };
  const setK = (path, v) => {
    const parts = path.split(".");
    if (parts.length === 1) { w[parts[0]] = v; return; }
    w[parts[0]][parts[1]] = v;
  };
  paint();
  const reloadAll = async (keepSel) => { D = await api.workflows(); D.win = D.win || 100000; pick(); dirty = false; if (!keepSel) S.sel = "content"; paint(); };
  let pan = null;
  const onPanMove = (e) => {
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved && (dx * dx + dy * dy) < 16) return;
    pan.moved = true;
    pan.cv.scrollLeft = pan.sl - dx;
    pan.cv.scrollTop = pan.st - dy;
  };
  const endPan = () => {
    if (!pan) return;
    pan.cv.classList.remove("panning");
    rememberScroll();
    if (pan.moved) pan.cv.dataset.panned = "1";
    pan = null;
    window.removeEventListener("pointermove", onPanMove);
    window.removeEventListener("pointerup", endPan);
    window.removeEventListener("pointercancel", endPan);
    window.removeEventListener("mousemove", onPanMove);
    window.removeEventListener("mouseup", endPan);
  };
  el.addEventListener("pointerdown", (e) => {
    const cv = e.target.closest(".wf-canvas");
    if (!cv || e.button !== 0) return;
    pan = { cv, x: e.clientX, y: e.clientY, sl: cv.scrollLeft, st: cv.scrollTop, moved: false };
    cv.classList.add("panning");
    window.addEventListener("pointermove", onPanMove);
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    window.addEventListener("mousemove", onPanMove);
    window.addEventListener("mouseup", endPan);
  }, true);
  el.addEventListener("click", (e) => {
    const cv = e.target.closest(".wf-canvas");
    if (!cv?.dataset.panned) return;
    delete cv.dataset.panned;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    try {
      if (t.hasAttribute("data-new")) {
        const picks = await newWorkflowPopup(el, `Workflow ${D.workflows.length + 1}`, paletteOf());
        if (!picks) return;
        const r = await api.workflowSave(null, workflowFromPicks(picks));
        S.wid = r.id; await reloadAll(); toast("Đã tạo workflow"); return;
      }
      if (t.hasAttribute("data-edit-pal")) {
        if (!w) return;
        const selected = new Set();
        for (const [, , list] of paletteOf()) for (const [id] of list) if (on(w, id)) selected.add(id);
        const edits = await editPalettePopup(el, paletteOf(), selected);
        if (!edits) return;
        const ids = [...edits.ids];
        for (const row of edits.extra || []) {
          const added = asList(await api.workflowItemAdd(row.gid, { items: row.items }), "items");
          for (const it of added) ids.push(itemKey(it));
        }
        if ((edits.groups || []).length) {
          const created = asList(await api.workflowGroupSave(null, { groups: edits.groups }), "groups");
          for (const g of created) for (const it of g.items || []) ids.push(itemKey(it));
        }
        const B = await api.workflowBlocks();
        D.block_groups = B.groups;
        D.blocks = B.blocks;
        S.cat = catalog(D);
        applyPicksToWorkflow(w, ids);
        dirty = true;
        paint();
        toast("Đã sửa khối — nhớ Lưu workflow");
        return;
      }
      if (t.dataset.view) { S.view = t.dataset.view; paint(); return; }
      if (t.dataset.node) { S.sel = t.dataset.node; el.querySelectorAll(".wf-n").forEach((b) => b.classList.toggle("on", b.dataset.node === S.sel)); el.querySelector("#wf-insp").innerHTML = inspector(w, D); return; }
      if (t.dataset.add) {
        const id = t.dataset.add;
        const has = on(w, id);
        const core = !nodeOf(id)?.opt && id !== "review" && id !== "g2" && id !== "footage";
        if (has && core) { S.sel = id; S.view = "flow"; paint(); return; }
        if (id === "footage") { w.content.families = has ? ["A1"] : ["A4"]; w.a4_line = !has; dirty = true; }
        else if (id === "review") { w.build.auto_render = has; dirty = true; }
        else if (id === "g2") {
          if (has) { S.sel = "g2"; S.view = "flow"; paint(); return; }
          w.publish.on = false; w.editor.on = false; w.editor.telegram = false;
          dirty = true;
        } else if (id === "editor") {
          w.editor.on = !has;
          w.editor.telegram = !has;
          dirty = true;
        } else if (id === "publish" || id === "post") {
          w.publish.on = !has;
          dirty = true;
        } else if (id === "check") {
          if (!has) { w.publish.on = true; w.check.on = true; }
          else w.check.on = false;
          dirty = true;
        } else if (id === "stats") {
          w.publish.on = !has;
          dirty = true;
        } else if (id === "learn") {
          w.learn.on = !has;
          if (!has) w.publish.on = true;
          dirty = true;
        } else if (!NODES[id]) {
          w.block_on = { ...(w.block_on || {}), [id]: !has };
          dirty = true;
        }
        S.sel = id === "post" ? "publish" : id; S.view = "flow"; paint(); return;
      }
      if (t.dataset.off) {
        const id = t.dataset.off;
        if (id === "publish" || id === "post") { w.publish.on = false; S.sel = "g2"; touch(); return; }
        w[id].on = false; if (id === "check") w.editor.on = false; S.sel = "g2"; touch(); return;
      }
      if (t.hasAttribute("data-enable")) { w.enabled = !w.enabled; touch(); return; }
      if (t.dataset.day !== undefined) { const d = +t.dataset.day, s = new Set(w.trigger.days); s.has(d) ? s.delete(d) : s.add(d); w.trigger.days = [...s].sort(); touch(); return; }
      if (t.dataset.fam) { w.content.families = [t.dataset.fam]; if (t.dataset.fam !== "A4") w.a4_line = false; else if (w.a4_line == null) w.a4_line = true; touch(); return; }
      if (t.dataset.lang) { w.lang = t.dataset.lang; touch(); return; }
      if (t.dataset.target) { w.publish.target = t.dataset.target; touch(); return; }
      if (t.hasAttribute("data-chall") || t.hasAttribute("data-chnone")) {
        const vis = D.channels.filter((c) => !S.chq || c.name.toLowerCase().includes(S.chq.toLowerCase())).map((c) => c.cid);
        const s = new Set(w.publish.channels); vis.forEach((c) => (t.hasAttribute("data-chall") ? s.add(c) : s.delete(c))); w.publish.channels = [...s]; touch(); return;
      }
      if (t.hasAttribute("data-save")) {
        const r = await api.workflowSave(w.id, w); S.wid = r.id; await reloadAll(true); toast("Đã lưu workflow"); return;
      }
      if (t.hasAttribute("data-run")) {
        if (dirty) { await api.workflowSave(w.id, w); }
        await api.workflowRun(w.id); toast("Đang chạy workflow — xem tiến độ ở Lịch sử chạy hoặc Job"); setTimeout(() => reloadAll(true), 3000); return;
      }
      if (t.hasAttribute("data-del")) {
        const ok = await askPopup(el, { title: "Xoá workflow?", text: `Xoá “${w.name}”? Lịch chạy của nó cũng bị xoá.`, ok: "Xoá", danger: true });
        if (!ok) return;
        await api.workflowDelete(w.id); S.wid = null; await reloadAll(); toast("Đã xoá workflow"); return;
      }
    } catch (err) { toast(err.message, true); }
  });
  el.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id === "wf-pick") {
      if (dirty) {
        const ok = await askPopup(el, { title: "Chưa lưu", text: "Bỏ thay đổi chưa lưu để chuyển workflow khác?", ok: "Bỏ thay đổi" });
        if (!ok) { t.value = S.wid; return; }
      }
      S.wid = t.value; pick(); dirty = false; paint(); return;
    }
    if (t.dataset.k) {
      let v = t.value;
      if (t.dataset.k === "trigger.times") v = v.split(",").map((x) => x.trim()).filter(Boolean);
      if (t.type === "number") v = +v;
      setK(t.dataset.k, v); touch(); return;
    }
    if (t.dataset.b) {
      if (t.dataset.b.includes(".")) setK(t.dataset.b, t.checked);
      else w[t.dataset.b] = t.checked;
      touch(); return;
    }
    if (t.dataset.topic) { const s = new Set(w.content.topics); t.checked ? s.add(t.dataset.topic) : s.delete(t.dataset.topic); w.content.topics = [...s]; dirty = true; el.querySelector("header").outerHTML = header(); return; }
    if (t.dataset.ch) { const s = new Set(w.publish.channels); t.checked ? s.add(t.dataset.ch) : s.delete(t.dataset.ch); w.publish.channels = [...s]; dirty = true; el.querySelector("header").outerHTML = header(); return; }
  });
  el.addEventListener("input", (e) => {
    if (e.target.id === "wf-name") { w.name = e.target.value; dirty = true; const b = el.querySelector("[data-save]"); if (b) b.textContent = "Lưu thay đổi"; }
    if (e.target.id === "wf-chq") { S.chq = e.target.value; const ins = el.querySelector("#wf-insp"); ins.innerHTML = inspector(w, D); const q = ins.querySelector("#wf-chq"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  });
  ctx.setCleanup(() => {});
}
