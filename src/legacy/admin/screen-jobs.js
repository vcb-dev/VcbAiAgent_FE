// Job · tự động: dải lịch tự động (bật/tắt, giờ, số video, chạy ngay) + bảng kanban theo trạng thái.
// Sửa lịch mở ngăn bên phải; "Chọn nhiều" bật tích chọn để duyệt/render/xoá hàng loạt.
import { api, esc, media, toast } from "./admin-api.js";
import { money } from "../i18n.js";

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];          // Python weekday 0 = thứ 2
const MODES = { mix: "Kho trước, thiếu thì AI viết", library: "Chỉ kho content", ai: "AI viết mới toàn bộ" };
const MODE_HINT = {
  mix: "1 bài / danh mục (nhẫn, dây chuyền, bông tai…). 5 video nhẫn + 10 video dây chuyền = 2 bài. Thiếu thì bấm viết. Đọc rồi duyệt.",
  library: "Chỉ dùng bài kho cùng danh mục (nhẫn với nhẫn). Không viết mới.",
  ai: "Bấm viết: AI ra 1 bài cho danh mục đang thiếu, dùng chung mọi video loại đó. Đọc rồi duyệt.",
};
const COLS = [
  ["Nháp", ["draft", "created"], ""], ["Đang dựng", ["rendering"], "run"], ["Chờ duyệt", ["waiting_g2", "missing_asset"], "warn"],
  ["Đã duyệt", ["passed", "capcut"], "ok"], ["Lỗi", ["render_error", "rejected"], "bad"],
];
const selected = new Set();
let selecting = false;
let editing = null;                 // schedule id being edited ("" = new) — drawer open when !== null
let drawer = false;

const checks = (name, items, on, label = (x) => x, value = (x) => x) => items.map((x) =>
  `<label class="chip" style="cursor:pointer;min-height:32px"><input type="checkbox" class="chk" style="width:16px;height:16px" name="${name}" value="${esc(String(value(x)))}" ${on.includes(value(x)) ? "checked" : ""}> ${esc(label(x))}</label>`).join("");
const radios = (name, items, on, label = (x) => x, value = (x) => x) => items.map((x) =>
  `<label class="chip" style="cursor:pointer;min-height:32px"><input type="radio" class="chk" style="width:16px;height:16px" name="${name}" value="${esc(String(value(x)))}" ${value(x) === on ? "checked" : ""}> ${esc(label(x))}</label>`).join("");

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
const A4_FORMULA = [
  ["thiet_ke", "chuan_bi_nguyen_lieu", "nung_nau"],
  ["do_khuon", "dap_can", "tao_dang", "cua_cat"],
  ["han", "dua_mai", "khoan", "gan_da_chu"],
  ["dinh_da", "lam_sach", "danh_bong", "khac_laser", "hoan_thien"],
];
const CRAFT_STEPS_DEFAULT = [
  { step: "thiet_ke", label: "Thiết kế / phác thảo" },
  { step: "chuan_bi_nguyen_lieu", label: "Chuẩn bị nguyên liệu" },
  { step: "nung_nau", label: "Nung nấu bạc / vàng" },
  { step: "do_khuon", label: "Đổ khuôn phôi" },
  { step: "dap_can", label: "Đập cán phôi" },
  { step: "tao_dang", label: "Tạo dáng / uốn" },
  { step: "cua_cat", label: "Cưa cắt chi tiết" },
  { step: "han", label: "Hàn nối" },
  { step: "dua_mai", label: "Dũa mài" },
  { step: "khoan", label: "Khoan" },
  { step: "gan_da_chu", label: "Gắn đá chủ" },
  { step: "dinh_da", label: "Đính đá tấm" },
  { step: "lam_sach", label: "Làm sạch" },
  { step: "danh_bong", label: "Đánh bóng" },
  { step: "khac_laser", label: "Khắc laser" },
  { step: "hoan_thien", label: "Hoàn thiện / kiểm tra" },
];

const a4Key = (s) => (s.from === "product" || s.kind === "product" ? `product:${s.variant || "hero"}` : (s.from || s.kind));

function withSlotIndex(slots) {
  const count = { craft: 0, huyk: 0 };
  return (slots || A4_SLOTS).map((s) => {
    const from = s.from || s.kind;
    if (from === "craft") {
      const at = count.craft++;
      return { ...s, from, at, role: `Chế tác ${at + 1}`, seconds: s.seconds || 3 };
    }
    if (from === "huyk") {
      const at = count.huyk++;
      return { ...s, from, at, role: "HuyK", seconds: s.seconds || 4 };
    }
    if (from === "product") {
      const final = s.variant === "final";
      return { ...s, from, role: final ? "Sản phẩm hoàn thiện" : "Sản phẩm", seconds: s.seconds || (final ? 8 : 5) };
    }
    return { ...s, from, role: "Outro", seconds: s.seconds || 4 };
  });
}

function spreadCraft(allSteps) {
  const ordered = (allSteps || []).filter((s) => s.step && s.step !== "hoan_thien");
  const count = Math.min(4, ordered.length);
  if (count <= 1) return ordered.slice(0, count).map((s, at) => ({ step: s.step, name: s.label, at }));
  const picks = [];
  let last = -1;
  for (let i = 0; i < count; i++) {
    let idx = Math.round(i * (ordered.length - 1) / (count - 1));
    if (idx <= last) idx = last + 1;
    if (idx >= ordered.length) break;
    last = idx;
    const s = ordered[idx];
    picks.push({ step: s.step, name: s.label, at: picks.length });
  }
  return picks;
}

function formulaCraft(allSteps, randomize) {
  if (!randomize) return spreadCraft(allSteps);
  const have = new Map((allSteps || []).map((s) => [s.step, s]));
  const used = new Set();
  return A4_FORMULA.map((group, at) => {
    const choices = group.filter((id) => have.has(id) && !used.has(id));
    if (!choices.length) return null;
    const id = choices[Math.floor(Math.random() * choices.length)];
    used.add(id);
    return { step: id, name: have.get(id).label, at };
  }).filter(Boolean).map((row, at) => ({ ...row, at }));
}

let a4Draft = null;

function initA4Draft(s, auto) {
  const allSteps = (auto.craft_steps && auto.craft_steps.length) ? auto.craft_steps : CRAFT_STEPS_DEFAULT;
  const saved = s?.a4_plan;
  if (saved?.slots?.length) {
    a4Draft = {
      enabled: s.a4_line !== false,
      _langs: s.langs || ["vi"],
      slots: saved.slots.map((sl) => ({ ...sl, from: sl.from || sl.kind })),
      craft: saved.craft || [],
      huyk: saved.huyk || []
    };
  } else {
    a4Draft = {
      enabled: s?.a4_line !== false,
      _langs: s?.langs || ["vi"],
      slots: A4_SLOTS.map((sl) => ({ ...sl })),
      craft: formulaCraft(allSteps, false),
      huyk: [
        { name: "Keo-soi", path: "Keo-soi", at: 0 },
        { name: "Dap-bua", path: "Dap-bua", at: 1 },
      ]
    };
  }
  return a4Draft;
}

function viExportOn() {
  const boxes = [...document.querySelectorAll('input[name="lang"]:checked')];
  if (boxes.length) return boxes.some((i) => i.value === "vi");
  return (a4Draft?._langs || ["vi"]).includes("vi");
}

function renderA4SlotsHtml(auto) {
  const allSteps = (auto.craft_steps && auto.craft_steps.length) ? auto.craft_steps : CRAFT_STEPS_DEFAULT;
  const draft = a4Draft;
  if (!draft) return "";
  const slots = withSlotIndex(draft.slots);
  const huykList = auto.huyk_actions || [];
  const showOutro = viExportOn();
  const kinds = showOutro ? A4_KINDS : A4_KINDS.filter((k) => k.key !== "outro");

  return slots.map((s, i) => {
    if (s.from === "outro" && !showOutro) return "";
    const currentCraft = s.from === "craft" ? draft.craft?.[s.at] : null;
    const currentHuyk = s.from === "huyk" ? draft.huyk?.[s.at] : null;
    const kindOpts = kinds.map((k) =>
      `<option value="${k.key}" ${a4Key(s) === k.key ? "selected" : ""}>${esc(s.from === "craft" && k.key === "craft" ? s.role : k.role)} · ${k.seconds}s</option>`
    ).join("");
    let src = `<span class="muted small" style="text-align:right">Cận cảnh sản phẩm</span>`;
    if (s.from === "product") {
      const final = s.variant === "final";
      src = `<span class="muted small" style="text-align:right">${final ? "Thành phẩm (360° / mẫu đeo)" : "Hero shot sản phẩm"}</span>`;
    } else if (s.from === "craft") {
      src = `<span class="slot-src" style="display:flex;gap:6px;align-items:center;min-width:0;flex:1">
        <select class="in" data-a4-act="craft" data-i="${i}" style="min-height:28px;padding:2px 8px;font-size:12px;flex:1">
          ${allSteps.map((st) => `<option value="${esc(st.step)}" ${currentCraft?.step === st.step ? "selected" : ""}>${esc(st.label)}</option>`).join("")}
        </select>
        <button class="btn sm" type="button" data-a4-act="roll" data-i="${i}" title="Đổi công đoạn khác trong nhóm" style="padding:2px 8px;min-height:28px">↻</button>
      </span>`;
    } else if (s.from === "huyk") {
      src = `<span class="slot-src" style="display:flex;gap:6px;align-items:center;min-width:0;flex:1">
        <select class="in" data-a4-act="huyk" data-i="${i}" style="min-height:28px;padding:2px 8px;font-size:12px;flex:1">
          <option value="">Tự động / ngẫu nhiên</option>
          ${huykList.map((h) => `<option value="${esc(h.name)}" ${currentHuyk?.name === h.name ? "selected" : ""}>${esc(h.label)}${h.clips ? ` · ${h.clips} clip` : ""}</option>`).join("")}
        </select>
        <button class="btn sm" type="button" data-a4-act="roll" data-i="${i}" title="Bốc cảnh HuyK khác" style="padding:2px 8px;min-height:28px">↻</button>
      </span>`;
    } else if (s.from === "outro") {
      src = `<span class="muted small" style="text-align:right">Chỉ bản tiếng Việt · kho outro HuyK + logo VCB</span>`;
    }

    return `
      <div class="a4-slot" style="display:flex;align-items:center;gap:10px;padding:6px 8px;background:var(--pane);border-radius:6px;border:1px solid var(--line)">
        <span class="mono small muted" style="width:24px">#${i + 1}</span>
        <select class="in a4-kind" data-a4-act="kind" data-i="${i}" style="min-height:28px;padding:2px 8px;font-size:12px;width:155px">
          ${kindOpts}
        </select>
        <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-end">
          ${src}
        </div>
      </div>`;
  }).join("");
}

function renderA4Route(auto, visible = true) {
  const draft = a4Draft;
  if (!draft) return "";
  return `
    <div id="a4-route-box" style="display:${visible ? "flex" : "none"};border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--pane-2, var(--pane));flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:600">
          <input type="checkbox" id="p-a4-line" class="chk" ${draft.enabled !== false ? "checked" : ""}>
          Footage theo tuyến A4 (công đoạn chế tác)
        </label>
        <span class="a4-tools" style="display:flex;gap:6px">
          <button class="btn sm" type="button" id="a4-formula-btn" title="Xếp 4 ô chế tác từ đầu tới cuối quy trình">Theo thứ tự công đoạn</button>
          <button class="btn sm" type="button" id="a4-shuffle-btn" title="Bốc lại ngẫu nhiên các công đoạn trong từng nhóm">↻ Đổi ngẫu nhiên</button>
        </span>
      </div>
      <p class="muted small" style="margin:0">Khóa thứ tự các ô cảnh cho video A4 (Sản phẩm ➔ HuyK ➔ Các công đoạn chế tác ➔ Thành phẩm). Outro + logo chỉ ghép khi tick tiếng Việt ở “Ngôn ngữ xuất video”; các tiếng khác bỏ outro và không hiện logo. "Theo thứ tự công đoạn" xếp từ đầu tới cuối quy trình, không nhảy lùi.</p>
      <div id="a4-slots-list" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;padding-right:4px">
        ${renderA4SlotsHtml(auto)}
      </div>
    </div>`;
}

function planForm(auto, s) {
  s = s || { name: "Lịch tự động", enabled: true, times: ["08:00"], days: [0, 1, 2, 3, 4, 5, 6], count: 5, skus: [],
    families: ["A4"], topics: [], content_mode: "mix", auto_render: false, langs: ["vi"], voice: "", music_track: "", a4_line: true, hook_text: false };
  initA4Draft(s, auto);
  const prods = auto.products;
  const langs = s.langs || ["vi"];
  const lang = langs[0] || "vi";
  const fam = (s.families && s.families[0]) || "A4";
  const curVoice = s.voice || "";
  const voiceList = (auto.voices && auto.voices.length) ? auto.voices : [
    { id: "HuyK_VN_4720ecdb", label: "HuyK VN · giọng Việt chính", lang: "vi" },
    { id: "HuyK_USA_c0f8e735", label: "HuyK USA", lang: "en" },
    { id: "HuyK_TH_e26deb62", label: "HuyK TH", lang: "th" },
    { id: "HuyK_TBN_71a9c0d2", label: "HuyK TBN", lang: "es" },
    { id: "Huyk_JP_4548aedc", label: "HuyK JP", lang: "ja" },
  ];
  const voiceOptions = voiceList.map((v) =>
    `<option value="${esc(v.id)}" ${curVoice === v.id ? "selected" : ""}>${esc(v.label || v.id)}${v.lang ? ` (${esc(v.lang.toUpperCase())})` : ""}</option>`
  ).join("");
  const langChips = (auto.languages || [{ code: "vi", label: "Tiếng Việt", voice: true, outro: true }]).map((l) =>
    `<label class="chip" style="cursor:pointer;min-height:32px" title="${l.voice ? "Có giọng HuyK" : "Chưa có giọng HuyK cho ngôn ngữ này"}${l.outro ? " · có outro" : ""}">
      <input type="radio" class="chk" style="width:16px;height:16px" name="lang" value="${esc(l.code)}" ${lang === l.code ? "checked" : ""}>
      <span class="mono small">${esc(l.code.toUpperCase())}</span> ${esc(l.label)}${!l.voice ? ' <span class="muted small">· chưa có giọng</span>' : l.code !== "vi" && l.own_voice === false ? ' <span class="muted small">· giọng Việt</span>' : ""}</label>`).join("");
  return `<section aria-labelledby="plan-h" style="display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 id="plan-h">${editing ? "Sửa lịch" : "Chạy tự động"}</h2>
      <span class="chip ${auto.ai_available ? "ok" : "warn"}">${auto.ai_available ? "AI viết content sẵn sàng" : "AI chưa có key · chỉ dùng kho"}</span></div>
    <div class="grid2">
      <div><label class="f" for="p-name">Tên lịch</label><input id="p-name" class="in" value="${esc(s.name)}"></div>
      <div><label class="f" for="p-count">Số video / lần chạy</label><input id="p-count" class="in" type="number" min="1" max="50" value="${s.count}"></div>
    </div>
    <div><span class="f">Ngôn ngữ xuất video <span class="muted" id="lang-n"></span></span><div class="tabs">${langChips}</div>
      <p class="muted small" style="margin:4px 0 0">Một lịch = một tiếng (lời HuyK + phụ đề đúng tiếng đó). Muốn thêm tiếng khác thì tạo lịch mới. Outro HuyK và logo chỉ trên bản tiếng Việt.</p></div>
    <div><label class="f" for="p-voice">Giọng đọc</label><select id="p-voice" class="in">
      <option value="" ${!curVoice ? "selected" : ""}>Tự động theo ngôn ngữ (HuyK chuẩn theo từng thứ tiếng)</option>
      ${voiceOptions}
    </select>
      <p class="muted small" style="margin:4px 0 0">Mặc định tự động chọn giọng HuyK theo từng ngôn ngữ xuất (HuyK VN cho tiếng Việt, HuyK USA cho tiếng Anh...). Chọn giọng cố định nếu muốn áp dụng cho toàn bộ video.</p></div>
    <div><label class="f" for="p-music">Nhạc nền</label><select id="p-music" class="in">
      <option value="" ${!(s.music_track) ? "selected" : ""}>Bỏ trống · random mỗi video</option>
      ${(auto.music || []).map((m) => `<option value="${esc(m.id)}" ${s.music_track === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
    </select>
      <p class="muted small" style="margin:4px 0 0">Không chọn = mỗi video bốc một bài khác trong kho Nhạc. Chọn một bài thì mọi video trong lịch dùng bài đó.</p></div>
    <div><span class="f">Nhóm content</span><div class="tabs">${radios("fam", Object.keys(auto.families), fam, (f) => auto.families[f])}</div>
      <p class="muted small" style="margin:4px 0 0">Một lịch = một tuyến (A1…A5). Chọn A4 mới khóa footage theo công đoạn chế tác. Muốn chạy tuyến khác thì tạo lịch riêng.</p></div>
    ${renderA4Route(auto, fam === "A4")}
    <div><span class="f">Chủ đề (bỏ trống = tất cả)</span><div class="tabs">${checks("topic", auto.topics, s.topics)}</div></div>
    <div><label class="f" for="p-mode">Nguồn content</label><select id="p-mode" class="in">${Object.entries(MODES).map(([k, v]) =>
      `<option value="${k}" ${s.content_mode === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <p class="muted small" id="mode-hint" style="margin:6px 0 0">${esc(MODE_HINT[s.content_mode] || MODE_HINT.mix)}</p>
      <div id="mix-box" style="display:${s.content_mode === "library" ? "none" : "flex"};flex-direction:column;gap:8px;margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--pane-2, var(--pane))">
        <p class="muted small" style="margin:0">Thiếu theo <b>danh mục</b>: mỗi loại sản phẩm (nhẫn / dây chuyền / bông tai…) cần 1 bài, dùng chung mọi video loại đó.</p>
        <div id="mix-gap" class="muted small"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn pri" type="button" id="p-write-content" ${auto.ai_available ? "" : "disabled"}>Viết 1 bài mới</button>
          <a class="btn sm" href="#/content">Mở Kho content</a>
        </div>
        <div id="mix-review"></div>
        ${auto.ai_available ? "" : '<span class="chip bad">Chưa có khoá AI</span>'}
      </div>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="f">Mã sản phẩm sẽ chạy <span id="sku-n" class="muted"></span></span>
        <span><button type="button" class="btn sm" id="sku-all">Chọn hết</button> <button type="button" class="btn sm" id="sku-none">Bỏ chọn</button></span></div>
      <input id="sku-q" class="in" placeholder="Tìm mã / tên…" style="margin:6px 0">
      <div id="sku-list" style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px">
        ${prods.length ? prods.map((p) => `<label style="display:flex;gap:8px;align-items:center;padding:4px 2px;cursor:pointer" data-q="${esc((p.sku + " " + p.name).toLowerCase())}">
          <input type="checkbox" class="chk" name="sku" value="${esc(p.sku)}" ${s.skus.includes(p.sku) ? "checked" : ""}>
          <span class="mono" style="font-size:12.5px">${esc(p.sku)}</span><span class="muted small" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>
          <span class="chip">${p.clips} clip</span></label>`).join("") : '<p class="muted small">Chưa có bộ footage sản phẩm trong SOURCE.</p>'}
      </div>
      <p class="muted small" style="margin:4px 0 0">Chỉ hiện mã đủ ≥3 công đoạn chế tác. Không chọn = xoay vòng các mã này.</p>
    </div>
    <div class="grid2">
      <div><label class="f" for="p-times">Giờ chạy (HH:MM, cách nhau dấu phẩy)</label><input id="p-times" class="in" value="${esc(s.times.join(", "))}" placeholder="08:00, 14:00"></div>
      <div><span class="f">Ngày</span><div class="tabs">${checks("day", DAYS.map((_, i) => i), s.days, (i) => DAYS[i])}</div></div>
    </div>
    <label style="display:flex;gap:8px;align-items:center"><input id="p-hook" type="checkbox" class="chk" ${s.hook_text ? "checked" : ""}> Hiện chữ tiêu đề ở đầu video</label>
    <label style="display:flex;gap:8px;align-items:center"><input id="p-render" type="checkbox" class="chk" ${s.auto_render ? "checked" : ""}> Render luôn (bỏ qua bước duyệt nháp)</label>
    <label style="display:flex;gap:8px;align-items:center"><input id="p-enabled" type="checkbox" class="chk" ${s.enabled ? "checked" : ""}> Lịch đang bật</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="p-run" class="btn pri" type="button">${editing ? "Lưu &amp; chạy ngay" : "Chạy ngay"}</button>
      <button id="p-save" class="btn" type="button">${editing ? "Lưu thay đổi lịch" : "Lưu thành lịch"}</button>
      ${editing ? '<button id="p-cancel" class="btn" type="button">Huỷ sửa</button>' : ""}
    </div>
    <p class="muted small" style="margin:0">Mỗi video ghép 1 mã SP × 1 content; footage chỉ lấy đúng bộ của mã. HuyK xuất hiện ~3–4s/lần. Logo và outro chỉ trên bản tiếng Việt.</p>
  </section>`;
}

function readForm(el) {
  const vals = (n) => [...el.querySelectorAll(`input[name="${n}"]:checked`)].map((i) => i.value);
  const a4Line = el.querySelector("#p-a4-line") ? el.querySelector("#p-a4-line").checked : true;
  const a4Plan = a4Draft ? {
    slots: withSlotIndex(a4Draft.slots).map((s) => ({ kind: s.from, variant: s.variant || null, seconds: s.seconds, at: s.at ?? null })),
    craft: (a4Draft.craft || []).filter(Boolean).map((c) => ({ step: c.step, name: c.name, at: c.at })),
    huyk: (a4Draft.huyk || []).filter(Boolean).map((h) => ({ name: h.name, path: h.path || h.name, at: h.at })),
  } : null;
  return { name: el.querySelector("#p-name").value.trim() || "Lịch tự động", count: Number(el.querySelector("#p-count").value) || 1,
    families: vals("fam"), topics: vals("topic"), skus: vals("sku"), days: vals("day").map(Number),
    times: el.querySelector("#p-times").value.split(",").map((t) => t.trim()).filter(Boolean),
    content_mode: el.querySelector("#p-mode").value, auto_render: el.querySelector("#p-render").checked,
    langs: vals("lang").length ? vals("lang") : ["vi"],
    voice: el.querySelector("#p-voice") ? el.querySelector("#p-voice").value : "",
    music_track: el.querySelector("#p-music") ? el.querySelector("#p-music").value : "",
    a4_line: a4Line,
    a4_plan: a4Plan,
    hook_text: el.querySelector("#p-hook").checked,
    enabled: el.querySelector("#p-enabled").checked };
}

function schedulesBox(auto) {
  const list = auto.schedules;
  const runs = auto.running.concat(auto.runs).slice(0, 8);
  const voiceMap = Object.fromEntries(((auto.voices || []).concat([
    { id: "HuyK_VN_4720ecdb", label: "HuyK VN" },
    { id: "HuyK_USA_c0f8e735", label: "HuyK USA" },
    { id: "HuyK_TH_e26deb62", label: "HuyK TH" },
    { id: "HuyK_TBN_71a9c0d2", label: "HuyK TBN" },
    { id: "Huyk_JP_4548aedc", label: "HuyK JP" },
  ])).map((v) => [v.id, v.label || v.id]));
  return `<section aria-labelledby="sch-h" style="display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:14px">
    <h2 id="sch-h">Lịch đã lưu (${list.length})</h2>
    ${list.length ? list.map((s) => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);padding:10px 0">
      <div style="flex:1;min-width:180px"><strong>${esc(s.name)}</strong> <span class="chip ${s.enabled ? "ok" : ""}">${s.enabled ? "bật" : "tắt"}</span>
        <div class="muted small">${esc(s.times.join(", ") || "chưa đặt giờ")} · ${s.days.length === 7 ? "mỗi ngày" : s.days.map((d) => DAYS[d]).join(" ")} · ${s.count} video${(s.langs || ["vi"]).length > 1 ? ` × ${s.langs.length} tiếng` : ""} · ${(s.langs || ["vi"]).map((l) => l.toUpperCase()).join(" ")} ·
        ${s.voice ? `<span class="chip" title="Giọng đọc">🎙 ${esc(voiceMap[s.voice] || s.voice)}</span> · ` : ""}${s.music_track ? `<span class="chip" title="Nhạc nền">♪ ${esc((auto.music || []).find((m) => m.id === s.music_track)?.name || s.music_track)}</span> · ` : `<span class="muted">nhạc random</span> · `}${s.a4_line !== false ? `<span class="chip" title="Khóa footage theo tuyến A4">Tuyến A4</span> · ` : ""}${s.families.map((f) => `<span class="tag ${f}">${f}</span>`).join(" ")} · ${s.skus.length ? s.skus.length + " mã SP" : "mọi mã"} · ${esc(MODES[s.content_mode])}${s.auto_render ? " · render luôn" : ""}</div></div>
      <button class="btn sm" data-srun="${esc(s.id)}" type="button">Chạy ngay</button>
      <button class="btn sm" data-sedit="${esc(s.id)}" type="button">Sửa</button>
      <button class="btn sm" data-sdel="${esc(s.id)}" type="button">Xoá</button></div>`).join("") : '<p class="muted small">Chưa có lịch. Điền form bên trên rồi bấm "Lưu thành lịch".</p>'}
    <h2 style="margin-top:14px">Nhật ký chạy</h2>
    ${runs.length ? runs.map((r) => `<div style="border-top:1px solid var(--line);padding:8px 0">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="chip ${r.state === "running" ? "run" : r.errors?.length ? "warn" : "ok"}">${r.state === "running" ? "đang chạy" : r.state === "error" ? "lỗi" : "xong"}</span>
        <span class="mono small">${esc((r.started_at || "").slice(5, 16))}</span><span>${esc(r.name || "")}</span>
        <span class="muted small">${r.jobs.length}${r.requested ? "/" + r.requested : ""} job</span></div>
      ${(r.errors || []).slice(0, 3).map((e) => `<div class="small" style="color:var(--bad)">${esc(e)}</div>`).join("")}</div>`).join("") : '<p class="muted small">Chưa có lần chạy nào.</p>'}
  </section>`;
}

function nextRun(s) {
  if (!s?.enabled || !s.times?.length) return "";
  const now = new Date();
  for (let d = 0; d < 8; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const wd = (day.getDay() + 6) % 7;
    if (!s.days.includes(wd)) continue;
    for (const t of [...s.times].sort()) {
      const [h, m] = t.split(":").map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at > now) return `${t} ${d === 0 ? "hôm nay" : d === 1 ? "mai" : DAYS[wd]}`;
    }
  }
  return "";
}

function autostrip(auto) {
  const s = auto.schedules[0];
  if (!s) {
    return `<section class="box autostrip" aria-label="Lịch tự động"><strong>Tự động</strong><span class="muted">Tắt · chưa dựng video nào</span><div style="flex:1"></div>
      <button class="btn" type="button" data-open-plan="">Tạo lịch</button></section>`;
  }
  const running = auto.running.length;
  return `<section class="box autostrip" aria-label="Lịch tự động">
    <button class="switch" type="button" role="switch" aria-checked="${s.enabled}" aria-label="Bật lịch tự động" data-flip="${esc(s.id)}"></button>
    <strong>${esc(s.name)}</strong><span class="vsep"></span>
    <span class="muted">${esc(s.times.join(", ") || "chưa đặt giờ")} · ${s.days.length === 7 ? "hằng ngày" : s.days.map((d) => DAYS[d]).join(" ")}</span>
    <span>${s.count} video${(s.langs || ["vi"]).length > 1 ? ` × ${s.langs.length}` : ""}</span>
    <span class="mono small">${(s.langs || ["vi"]).map((l) => l.toUpperCase()).join(" · ")}</span>
    <span style="display:flex;gap:4px">${s.families.map((f) => `<span class="fam ${f}">${f}</span>`).join("")}</span>
    <span class="muted">${esc(s.topics.length ? s.topics.slice(0, 2).join(", ") + (s.topics.length > 2 ? "…" : "") : "mọi chủ đề")}</span>
    <div style="flex:1"></div>
    ${running ? `<span class="chip run">Đang chạy ${running} lượt</span>` : nextRun(s) ? `<span class="muted small">Lần tới · <span class="mono">${esc(nextRun(s))}</span></span>` : ""}
    ${auto.schedules.length > 1 ? `<span class="chip">${auto.schedules.length} lịch</span>` : ""}
    <button class="btn sm" type="button" data-open-plan="${esc(s.id)}">Sửa lịch</button>
    <button class="btn sm" type="button" data-stop-auto>Dừng & xoá job</button>
    <button class="btn sm ink" type="button" data-srun="${esc(s.id)}">Chạy ngay</button></section>`;
}

const STAGES = [["content", "Kịch bản"], ["plan", "Timeline · voice"], ["render", "Dựng HD"], ["done", "Xuất file"]];
const mmss = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const STAGE_IDX = { waiting: -1, content: 0, plan: 1, render: 2, draft: 2, done: 4, error: -2 };

function progress(auto) {
  const run = auto.running[0];
  if (!run || !run.items?.length) return "";
  const done = run.items.filter((it) => ["done", "draft"].includes(it.stage)).length;
  const errs = run.items.filter((it) => it.stage === "error").length;
  const pct = Math.round(((done + errs) / run.items.length) * 100);
  const row = (it) => {
    const at = STAGE_IDX[it.stage] ?? -1;
    const failAt = it.stage === "error" ? Math.max(0, STAGES.findIndex(([k]) => k === (it.job_id ? "render" : it.title ? "plan" : "content"))) : -1;
    const steps = STAGES.map(([, label], k) => {
      const cls = failAt === k ? "bad" : at > k || at === 4 ? "ok" : at === k ? "run" : "";
      return `<span class="pstep ${cls}" title="${label}"><span class="dot ${cls}"></span>${label}</span>`;
    }).join("");
    const tail = it.stage === "error" ? `<span class="small" style="color:var(--bad)">${esc(it.error || "Lỗi")}</span>`
      : it.stage === "done" ? (it.export ? `<a class="small mono" href="#/exports/${encodeURIComponent(it.export)}" title="Xem video">▶ ${esc(it.export)}</a>` : '<span class="small mono">Xong</span>')
      : it.stage === "draft" ? '<span class="small muted">Chờ duyệt render</span>' : "";
    const secs = it.total_s ?? (it.t0 && !["error", "draft"].includes(it.stage) ? Date.now() / 1000 - it.t0 : null);
    return `<div class="prow"><span class="mono small muted">${it.i + 1}</span><span class="fam ${esc(it.family)}">${esc(it.family)}</span>
      <span class="mono small" style="width:72px">${esc(it.sku)}</span>${run.langs?.length > 1 || (it.lang && it.lang !== "vi") ? `<span class="chip mono" style="min-height:22px;padding:0 6px">${esc((it.lang || "vi").toUpperCase())}</span>` : ""}
      <span class="pt">${it.job_id ? `<a href="#/review/${encodeURIComponent(it.job_id)}">${esc(it.title || "…")}</a>` : esc(it.title || (it.stage === "waiting" ? "Đang chờ lượt" : it.stage === "error" ? "Không có kịch bản" : "Đang chọn kịch bản…"))}</span>
      <span class="psteps">${steps}</span><span class="mono small ${it.total_s ? "" : "muted"}" style="width:44px;text-align:right" title="Thời gian làm video này">${mmss(secs)}</span><span class="ptail">${tail}</span></div>`;
  };
  return `<section class="box" aria-label="Tiến trình chạy">
    <div class="box-head"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <strong>Đang chạy</strong><span class="muted small">${esc(run.name || "")} · ${esc((run.started_at || "").slice(11, 16))}</span>
      <span class="chip ${errs ? "warn" : "run"}">${done}/${run.items.length} video${errs ? ` · ${errs} lỗi` : ""}</span>
      <button class="btn sm" type="button" data-stop-auto>Dừng</button>
      ${run.stats?.avg_s ? `<span class="chip">TB ${mmss(run.stats.avg_s)} / video</span><span class="chip">${run.stats.per_hour} video / giờ</span>` : ""}</div>
      <span class="prog" style="width:220px"><i style="width:${pct}%"></i></span></div>
    <div class="plist">${run.items.map(row).join("")}</div></section>`;
}

function shortErr(s) {
  const raw = String(s || "").replace(/\s+/g, " ").trim();
  const m = raw.match(/Unknown filter[^|]*/i) || raw.match(/No option name[^|]*/i) || raw.match(/ffmpeg failed[^|]*/i);
  const t = (m ? m[0] : raw).trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

const poster = (j) => j.poster || (j.render_status === "done" && j.revision ? `media/renders/${j.id}_r${j.revision}${j.quality === "preview" ? "_pv" : ""}.jpg` : "");

const aiCostChip = (c) => (c && c.logged ? `<span class="aicost" title="${Object.entries(c.by_task).map(([k, v]) => `${k}: ${money(v.vnd)}`).join(" · ")}">AI ${money(c.vnd)}</span>` : "");
function kcard(j) {
  const c = j.content;
  const title = c?.title || j.product_name || "Kịch bản tay";
  const busy = ["rendering", "created"].includes(j.state);
  const note = j.state === "missing_asset" ? `${j.gaps || ""} phần thiếu cảnh` : j.state === "render_error" ? (j.error ? shortErr(j.error) : "Render lỗi") : j.state === "rejected" ? (j.review?.[0]?.reason || "Đã loại")
    : j.state === "waiting_g2" && j.quality === "preview" ? "Bản nháp 360p" : j.state === "passed" ? "Đã xuất HD" : "";
  return `<article class="kcard">
    ${selecting ? `<input type="checkbox" class="chk" data-sel="${esc(j.id)}" aria-label="Chọn" ${selected.has(j.id) ? "checked" : ""}>` : ""}
    <a class="kt" href="#/review/${encodeURIComponent(j.id)}" aria-label="Mở ${esc(title)}">${poster(j) ? `<img src="${esc(media(poster(j)))}" alt="" loading="lazy" onerror="this.remove()">` : ""}</a>
    <div class="kb">
      <a href="#/review/${encodeURIComponent(j.id)}" class="ttl" style="color:inherit;text-decoration:none">${esc(title)}</a>
      <span class="meta">${c ? `<span class="fam ${esc(c.family)}">${esc(c.family)}</span>` : ""}<span class="mono">${esc(j.sku || "—")}</span>${j.duration ? `<span>${Math.round(j.duration)}s</span>` : ""}${aiCostChip(j.ai_cost)}</span>
      ${busy ? '<span class="prog" aria-label="Đang dựng"><i style="width:55%"></i></span>' : ""}
      ${j.export ? `<a class="small" style="color:var(--ok)" href="#/exports/${encodeURIComponent((j.export.name || j.export.path.split(/[\\/]/).pop()))}" title="Xem ${esc(j.export.path)}">▶ Xem file đã xuất</a>` : ""}
      ${note ? `<span class="small" style="color:${["render_error", "rejected", "missing_asset"].includes(j.state) ? "var(--bad)" : "var(--muted)"}">${esc(note)}</span>` : ""}
      <span class="acts">${j.state === "draft" ? `<button class="btn sm pri" type="button" data-approve="${esc(j.id)}">Render</button>` : ""}
        <a class="btn sm icon" href="/?job=${encodeURIComponent(j.id)}" aria-label="Mở trong Studio" title="Mở trong Studio"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1L19 8l-3-3L5 16z"/></svg></a>
        <button class="btn sm icon danger" type="button" data-del="${esc(j.id)}" aria-label="Xoá" title="Xoá"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></span>
    </div></article>`;
}

let kcol = 0;                        // phone: one column at a time, picked from a segmented switch
function board(jobs) {
  const counts = COLS.map(([, states]) => jobs.filter((j) => states.includes(j.state)).length);
  if (!counts[kcol]) kcol = Math.max(0, counts.findIndex((n) => n > 0));   // empty / leftover tab → Nháp, not Đang dựng
  return `<nav class="seg kseg" aria-label="Trạng thái job">${COLS.map(([name], i) => `<button type="button" data-kcol="${i}" aria-pressed="${i === kcol}">${name}<span class="mono n">${counts[i]}</span></button>`).join("")}</nav>
    <div class="kanban" data-col="${kcol}">${COLS.map(([name, states, dot]) => {
    const list = jobs.filter((j) => states.includes(j.state));
    return `<section class="kcol" aria-label="${name}"><header><span class="dot ${list.length ? dot : ""}"></span><strong>${name}</strong><span class="n">${list.length}</span></header>
      ${list.slice(0, 40).map(kcard).join("") || '<div class="muted small" style="padding:8px 4px">—</div>'}
      ${list.length > 40 ? `<div class="muted small" style="padding:4px">+${list.length - 40} job</div>` : ""}</section>`;
  }).join("")}</div>`;
}

function bulkbar() {
  if (!selecting) return "";
  return `<div class="bulkbar" role="region" aria-label="Thao tác hàng loạt"><strong>${selected.size} đã chọn</strong>
    <button class="btn sm pri" data-bulk="approve" type="button" ${selected.size ? "" : "disabled"}>Duyệt & render HD</button>
    <button class="btn sm" data-bulk="render" type="button" ${selected.size ? "" : "disabled"}>Render lại</button>
    <button class="btn sm danger" data-bulk="delete" type="button" ${selected.size ? "" : "disabled"}>Xoá</button>
    <div style="flex:1"></div><button class="btn sm" data-bulk="clear" type="button">Xong</button></div>`;
}

export async function render(view, ctx) {
  const el = document.createElement("div");
  el.className = "fscreen";
  view.replaceChildren(el);
  let [{ jobs }, auto] = await Promise.all([api.jobs(), api.automation()]);
  const paint = () => {
    el.innerHTML = `<header class="ph-bar"><h1>Job · tự động</h1><div class="sp"></div>
        <button class="btn" type="button" id="sel-mode" aria-pressed="${selecting}">${selecting ? "Bỏ chọn" : "Chọn nhiều"}</button>
        <a class="btn pri" href="/">+ Video mới</a></header>
      <div class="page">${autostrip(auto)}<div id="progress">${progress(auto)}</div><div id="bulk">${bulkbar()}</div><div id="board">${board(jobs)}</div></div>
      <div id="plan-drawer">${drawer ? `<div class="scrim" data-close></div><aside class="drawer" aria-label="Lịch tự động">
        <div style="display:flex;justify-content:space-between;align-items:center"><strong>Lịch tự động</strong><button class="btn icon" type="button" data-close aria-label="Đóng">✕</button></div>
        <div id="plan">${planForm(auto, editing ? auto.schedules.find((s) => s.id === editing) : null)}</div><div id="sched">${schedulesBox(auto)}</div></aside>` : ""}</div>`;
    if (drawer) bindPlan();
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kcol]");
    if (b) { kcol = +b.dataset.kcol; el.querySelector("#board").innerHTML = board(jobs); }
  });
  const reload = async () => {
    [{ jobs }, auto] = await Promise.all([api.jobs(), api.automation()]);
    const ids = new Set(jobs.map((j) => j.id));
    [...selected].forEach((id) => { if (!ids.has(id)) selected.delete(id); });
    el.querySelector("#board").innerHTML = board(jobs);
    el.querySelector("#bulk").innerHTML = bulkbar();
    el.querySelector("#progress").innerHTML = progress(auto);
    const strip = el.querySelector(".autostrip");
    if (strip) strip.outerHTML = autostrip(auto);
    if (drawer) { el.querySelector("#sched").innerHTML = schedulesBox(auto); }
    ctx.refreshBadges();
  };
  const $ = (s) => el.querySelector(s);

  function bindPlan() {
    const countSku = () => { $("#sku-n").textContent = `(${el.querySelectorAll('input[name="sku"]:checked').length} chọn)`; };
    countSku();
    $("#sku-list").addEventListener("change", () => { countSku(); refreshMixGap(); });
    const countLang = () => {
      const n = Number($("#p-count").value) || 1;
      $("#lang-n").textContent = `· ${n} video mỗi lần`;
    };
    countLang();
    el.querySelectorAll('input[name="lang"]').forEach((i) => i.addEventListener("change", () => { countLang(); refreshA4Slots(); refreshMixGap(); }));
    $("#p-count").addEventListener("input", () => { countLang(); refreshMixGap(); });
    $("#sku-q").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      el.querySelectorAll("#sku-list [data-q]").forEach((l) => { l.style.display = !q || l.dataset.q.includes(q) ? "" : "none"; });
    });
    $("#sku-all").addEventListener("click", () => { el.querySelectorAll("#sku-list [data-q]").forEach((l) => { if (l.style.display !== "none") l.querySelector("input").checked = true; }); countSku(); refreshMixGap(); });
    $("#sku-none").addEventListener("click", () => { el.querySelectorAll('input[name="sku"]').forEach((i) => { i.checked = false; }); countSku(); refreshMixGap(); });

    const refreshA4Slots = () => {
      const listEl = $("#a4-slots-list");
      if (listEl) listEl.innerHTML = renderA4SlotsHtml(auto);
    };

    const toggleA4Visibility = () => {
      const hasA4 = [...el.querySelectorAll('input[name="fam"]:checked')].some((i) => i.value === "A4");
      const a4Box = $("#a4-route-box");
      if (a4Box) a4Box.style.display = hasA4 ? "flex" : "none";
    };
    el.querySelectorAll('input[name="fam"]').forEach((i) => i.addEventListener("change", () => { toggleA4Visibility(); refreshMixGap(); }));

    $("#a4-formula-btn")?.addEventListener("click", () => {
      const allSteps = (auto.craft_steps && auto.craft_steps.length) ? auto.craft_steps : CRAFT_STEPS_DEFAULT;
      if (a4Draft) {
        a4Draft.craft = formulaCraft(allSteps, false);
        refreshA4Slots();
        toast("Đã xếp công đoạn theo thứ tự quy trình");
      }
    });

    $("#a4-shuffle-btn")?.addEventListener("click", () => {
      const allSteps = (auto.craft_steps && auto.craft_steps.length) ? auto.craft_steps : CRAFT_STEPS_DEFAULT;
      if (a4Draft) {
        a4Draft.craft = formulaCraft(allSteps, true);
        refreshA4Slots();
        toast("Đã đổi tổ hợp công đoạn ngẫu nhiên");
      }
    });

    $("#p-a4-line")?.addEventListener("change", (e) => {
      if (a4Draft) a4Draft.enabled = e.target.checked;
      const slotList = $("#a4-slots-list");
      if (slotList) slotList.style.opacity = e.target.checked ? "1" : "0.5";
    });

    $("#a4-slots-list")?.addEventListener("change", (e) => {
      const act = e.target.dataset.a4Act;
      const i = Number(e.target.dataset.i);
      if (!act || isNaN(i) || !a4Draft) return;
      const slots = withSlotIndex(a4Draft.slots);
      const slot = slots[i];
      const allSteps = (auto.craft_steps && auto.craft_steps.length) ? auto.craft_steps : CRAFT_STEPS_DEFAULT;

      if (act === "kind") {
        const kind = A4_KINDS.find((k) => k.key === e.target.value);
        if (!kind) return;
        a4Draft.slots = a4Draft.slots.map((s, n) => n === i ? { from: kind.from, variant: kind.variant, seconds: kind.seconds } : s);
        const next = withSlotIndex(a4Draft.slots)[i];
        if (next.from === "craft" && !a4Draft.craft?.[next.at]) {
          a4Draft.craft = a4Draft.craft || [];
          a4Draft.craft[next.at] = { step: allSteps[0]?.step || "nung_nau", name: allSteps[0]?.label || "Nung nấu", at: next.at };
        }
        refreshA4Slots();
      } else if (act === "craft" && slot?.from === "craft") {
        a4Draft.craft = a4Draft.craft || [];
        const stepObj = allSteps.find((st) => st.step === e.target.value);
        a4Draft.craft[slot.at] = { step: e.target.value, name: stepObj?.label || e.target.value, at: slot.at };
      } else if (act === "huyk" && slot?.from === "huyk") {
        a4Draft.huyk = a4Draft.huyk || [];
        a4Draft.huyk[slot.at] = { name: e.target.value, path: e.target.value, at: slot.at };
      }
    });

    $("#a4-slots-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-a4-act="roll"]');
      if (!btn || !a4Draft) return;
      const i = Number(btn.dataset.i);
      const slots = withSlotIndex(a4Draft.slots);
      const slot = slots[i];
      const allSteps = (auto.craft_steps && auto.craft_steps.length) ? auto.craft_steps : CRAFT_STEPS_DEFAULT;
      if (slot?.from === "craft") {
        const curStep = a4Draft.craft?.[slot.at]?.step;
        const group = A4_FORMULA.find((g) => g.includes(curStep)) || allSteps.map((s) => s.step);
        const choices = group.filter((id) => id !== curStep);
        const pickId = choices[Math.floor(Math.random() * choices.length)] || curStep;
        const stepObj = allSteps.find((s) => s.step === pickId);
        a4Draft.craft = a4Draft.craft || [];
        a4Draft.craft[slot.at] = { step: pickId, name: stepObj?.label || pickId, at: slot.at };
        refreshA4Slots();
      } else if (slot?.from === "huyk") {
        const huykList = auto.huyk_actions || [];
        if (huykList.length) {
          const cur = a4Draft.huyk?.[slot.at]?.name;
          const choices = huykList.filter((h) => h.name !== cur);
          const pick = choices[Math.floor(Math.random() * choices.length)] || huykList[0];
          a4Draft.huyk = a4Draft.huyk || [];
          a4Draft.huyk[slot.at] = { name: pick.name, path: pick.name, at: slot.at };
          refreshA4Slots();
        }
      }
    });
    const mixBox = () => $("#mix-box");
    const cardHtml = (c, highlight) => `<article style="border:1px solid var(--line);border-radius:10px;padding:10px;background:${highlight ? "var(--pane)" : "transparent"}">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
          <span class="chip">${esc((c.lang || "vi").toUpperCase())}</span>
          <span class="chip">${esc(c.family || "")}</span>
          ${c.kind ? `<span class="chip">${esc(c.kind)}</span>` : ""}
          <strong style="flex:1">${esc(c.title)}</strong>
        </div>
        <div class="small" style="white-space:pre-wrap;max-height:320px;overflow:auto;line-height:1.5">${esc(c.script || "")}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn pri sm" type="button" data-mix-ok="${esc(c.id)}">Duyệt · dùng cho video</button>
          <button class="btn sm danger" type="button" data-mix-drop="${esc(c.id)}">Bỏ bài này</button>
        </div>
      </article>`;
    const paintMixGap = (data) => {
      const box = $("#mix-gap");
      const runBtn = $("#p-run");
      if (!box) return;
      box.classList.remove("is-busy");
      const rows = data.gap || [];
      const appr = data.gap_approved || rows;
      const pending = data.pending || [];
      const needWrite = rows.filter((m) => m.write);
      const needApprove = appr.filter((m) => m.write);
      const missN = needApprove.length;
      const missVid = needApprove.reduce((s, m) => s + (m.videos || m.reuse || 0), 0);
      const head = rows.length
        ? (missN ? `<div style="font-weight:600;margin-bottom:4px">Thiếu ${missN} bài content · dùng chung ${missVid} video theo danh mục</div>`
          : `<div style="font-weight:600;margin-bottom:4px">Đủ bài theo danh mục</div>`)
        : "";
      box.innerHTML = rows.length
        ? head + rows.map((m) => {
          const a = appr.find((x) => x.lang === m.lang && x.family === m.family && (x.kind || "") === (m.kind || "")) || m;
          const ok = !a.write;
          const nVid = m.videos || m.reuse || 1;
          const kind = m.kind || "sản phẩm";
          return `<div>${esc((m.lang || "").toUpperCase())} · ${esc(m.family)} · <b>${esc(kind)}</b>: ${nVid} video${ok ? " · đã có 1 bài" : a.have < m.have ? " · còn nháp chưa duyệt" : " · thiếu 1 bài"}</div>`;
        }).join("")
        : "Chọn ngôn ngữ xuất, nhóm content và mã sản phẩm để tính bài thiếu theo danh mục.";
      const review = $("#mix-review");
      const freshId = data.freshId || "";
      if (review) {
        review.innerHTML = pending.length
          ? `<p class="muted small" style="margin:8px 0 4px">Cần duyệt ${pending.length} bài — mỗi danh mục một bài (nhẫn, dây chuyền…)</p>${pending.map((c) => cardHtml(c, c.id === freshId)).join("")}`
          : "";
      }
      if (runBtn) runBtn.disabled = false;
      const w = $("#p-write-content");
      const aiMode = $("#p-mode")?.value === "ai";
      if (w) {
        const canWrite = auto.ai_available && (aiMode || needWrite.length);
        w.disabled = !canWrite;
        w.textContent = needWrite.length ? `Viết 1 bài (còn ${needWrite.length})` : (aiMode ? "Viết 1 bài mới" : "Đã đủ bài");
      }
    };
    const refreshMixGap = async () => {
      const box = mixBox();
      if (!box) return;
      const mode = $("#p-mode")?.value || "mix";
      const hint = $("#mode-hint");
      if (hint) hint.textContent = MODE_HINT[mode] || "";
      const show = mode === "mix" || mode === "ai";
      box.style.display = show ? "flex" : "none";
      const runBtn = $("#p-run");
      if (runBtn) runBtn.disabled = false;
      if (!show) return;
      try { paintMixGap(await api.automationContentGap(readForm(el))); }
      catch (err) { const g = $("#mix-gap"); if (g) { g.classList.remove("is-busy"); g.textContent = err.message; } }
    };
    $("#p-mode").addEventListener("change", refreshMixGap);
    el.querySelectorAll('input[name="topic"]').forEach((i) => i.addEventListener("change", refreshMixGap));
    refreshMixGap();

    $("#p-write-content")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const n = $("#mix-gap");
      const prevGap = n ? n.innerHTML : "";
      if (n) { n.classList.remove("is-busy"); n.textContent = "Đang viết 1 bài mới… khoảng 15–40 giây."; n.classList.add("is-busy"); }
      try {
        const out = await api.automationPrepareContent(readForm(el));
        const item = out.item || (out.written || [])[0];
        paintMixGap({ ...out, freshId: item?.id || "" });
        $("#mix-review")?.scrollIntoView({ block: "nearest" });
        const nPend = (out.pending || []).length;
        toast(item
          ? (nPend > 1 ? `Đã viết xong. Còn ${nPend} bài cần duyệt (đủ danh mục bên dưới).` : "Đã viết xong. Duyệt bài này rồi chạy.")
          : (out.message || "Kho đã đủ, không cần viết thêm."));
      } catch (err) {
        if (n) n.innerHTML = prevGap;
        toast(err.message, true);
        btn.disabled = false;
      }
    });

    mixBox()?.addEventListener("click", async (e) => {
      const ok = e.target.closest("[data-mix-ok]");
      const drop = e.target.closest("[data-mix-drop]");
      if (!ok && !drop) return;
      const id = (ok || drop).dataset.mixOk || (ok || drop).dataset.mixDrop;
      (ok || drop).disabled = true;
      try {
        if (ok) {
          await api.contentUpdate(id, { status: "approved" });
          toast("Đã duyệt · bài này dùng cho video và đã lưu Kho content.");
        } else {
          await api.contentDelete(id);
          toast("Đã bỏ bài nháp.");
        }
        const fresh = $("#mix-review [data-mix-fresh]");
        if (fresh) fresh.remove();
        await refreshMixGap();
      } catch (err) { toast(err.message, true); (ok || drop).disabled = false; }
    });

    $("#p-run").addEventListener("click", async (e) => {
      const body = readForm(el);
      e.target.disabled = true;
      try {
        if (editing && body.times.length) { await api.scheduleSave(body, editing); auto = await api.automation(); }   // run what you see = save it too
        await api.automationRun(body); toast(`Đang tạo ${body.count * body.langs.length} video ở nền…`); drawer = false; paint(); setTimeout(reload, 1500); }
      catch (err) { toast(err.message, true); } finally { e.target.disabled = false; }
    });
    $("#p-save").addEventListener("click", async () => {
      const body = readForm(el);
      if (!body.times.length) { toast("Nhập ít nhất 1 giờ chạy (vd 08:00)", true); return; }
      try { await api.scheduleSave(body, editing || null); toast(editing ? "Đã lưu lịch" : "Đã tạo lịch"); editing = null; drawer = false; [{ jobs }, auto] = await Promise.all([api.jobs(), api.automation()]); paint(); }
      catch (err) { toast(err.message, true); }
    });
    $("#p-cancel")?.addEventListener("click", () => { editing = null; $("#plan").innerHTML = planForm(auto); bindPlan(); });
  }
  paint();

  el.addEventListener("change", (e) => {
    if (e.target.dataset.sel) { e.target.checked ? selected.add(e.target.dataset.sel) : selected.delete(e.target.dataset.sel); $("#bulk").innerHTML = bulkbar(); }
  });
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button, [data-close]");
    if (!b) return;
    try {
      if (b.id === "sel-mode") { selecting = !selecting; if (!selecting) selected.clear(); paint(); return; }
      if (b.hasAttribute("data-close")) { drawer = false; editing = null; paint(); return; }
      if (b.hasAttribute("data-stop-auto")) {
        b.disabled = true;
        await api.automationCancel();
        toast("Đã dừng tự động · đã xoá job đang dựng"); await reload(); return;
      }
      if (b.dataset.openPlan !== undefined) { editing = b.dataset.openPlan || null; drawer = true; paint(); return; }
      if (b.dataset.flip) {
        const s = auto.schedules.find((x) => x.id === b.dataset.flip);
        await api.scheduleSave({ ...s, enabled: !s.enabled }, s.id); toast(s.enabled ? "Đã tắt lịch" : "Đã bật lịch"); await reload(); return;
      }
      if (b.dataset.srun) { await api.scheduleRun(b.dataset.srun); toast("Đang chạy ở nền"); setTimeout(reload, 1500); return; }
      if (b.dataset.sedit) { editing = b.dataset.sedit; $("#plan").innerHTML = planForm(auto, auto.schedules.find((s) => s.id === editing)); bindPlan(); return; }
      if (b.dataset.sdel) {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Bấm lần nữa để xoá"; return; }
        await api.scheduleDelete(b.dataset.sdel); toast("Đã xoá lịch"); if (editing === b.dataset.sdel) editing = null; [{ jobs }, auto] = await Promise.all([api.jobs(), api.automation()]); paint(); return;
      }
      if (b.dataset.approve) { b.disabled = true; await api.bulkJobs({ ids: [b.dataset.approve], action: "approve" }); toast("Đang render"); await reload(); return; }
      if (b.dataset.del) {
        if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.classList.add("pri"); toast("Bấm lần nữa để xoá"); return; }
        await api.deleteJob(b.dataset.del); selected.delete(b.dataset.del); toast("Đã xoá job"); await reload(); return;
      }
      if (b.dataset.bulk) {
        const action = b.dataset.bulk;
        if (action === "clear") { selecting = false; selected.clear(); paint(); return; }
        if (action === "delete" && b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = `Xoá ${selected.size} job?`; return; }
        b.disabled = true;
        const res = await api.bulkJobs({ ids: [...selected], action });
        toast(`${res.done.length} job xong${res.errors.length ? ` · ${res.errors.length} lỗi: ${res.errors[0]}` : ""}`, !!res.errors.length);
        selected.clear(); await reload();
      }
    } catch (err) { toast(err.message, true); b.disabled = false; }
  });

  const timer = setInterval(() => { if (el.getClientRects().length && !drawer && (jobs.some((j) => ["rendering", "created"].includes(j.state)) || auto.running.length)) reload(); }, 4000);
  ctx.setCleanup(() => clearInterval(timer));
  ctx.setShow?.(() => { if (!drawer) reload(); });            // back on this tab: fresh numbers, no reload flash
}
