// Kho footage theo mã SP: chọn SKU rồi xếp công đoạn của đúng mã đó (không gộp mọi mã chung một cột).
import { api, esc, media, thumbImg, toast } from "./admin-api.js";

const st = { lib: "product", cat: "", sku: "", origin: "", step: "", group: "", q: "", shown: 60, picked: null,
  board: "index", shoot: "", hideStill: false, composer: null, boardErr: "", checked: new Set(), lastTick: "" };
const clearTicks = () => { st.checked = new Set(); st.lastTick = ""; };
const LIBS = { product: "Sản phẩm", huyk: "HuyK", illus: "Minh hoạ AI", outro: "Outro" };
const KINDS = [{ key: "nhan", label: "Nhẫn" }, { key: "lac_tay", label: "Lắc tay" },
  { key: "bong_tai", label: "Bông tai" }, { key: "day_chuyen", label: "Dây chuyền" }];
const STEP_VI = {
  do_bac: "Đổ bạc", bat_may_kho: "Bật máy khò", nung_bac: "Nung bạc", do_khuon: "Đổ khuôn",
  lam_nguoi: "Làm nguội", can_bac: "Cán bạc", kho_mem: "Khò mềm", dap_thang: "Dập thẳng",
  uon_khung: "Uốn khung", go_tron: "Gõ tròn", cua_nhan: "Cưa nhẫn", han_noi: "Hàn nối",
  dap_nhan: "Dập nhẫn", dap_co_dinh: "Dập cố định", nau_nhan: "Nấu nhẫn", dua_mai: "Giũa mài",
  khuon_lo_da: "Khoét lỗ đá", dinh_da: "Đính đá", co_dinh_chau: "Cố định chấu",
  danh_bong: "Đánh bóng", hoan_thien: "Hoàn thiện",
  thiet_ke: "Thiết kế", chuan_bi_nguyen_lieu: "Chuẩn bị nguyên liệu", nung_nau: "Nung · khò lửa",
  dap_can: "Đập/cán phôi", tao_dang: "Uốn tạo dáng", cua_cat: "Cưa cắt", han: "Hàn",
  khoan: "Khoan", gan_da_chu: "Gắn đá chủ", lam_sach: "Làm sạch", khac_laser: "Khắc laser",
};
const NEW_STEPS = ["do_bac", "bat_may_kho", "nung_bac", "do_khuon", "lam_nguoi", "can_bac", "kho_mem",
  "dap_thang", "uon_khung", "go_tron", "cua_nhan", "han_noi", "dap_nhan", "dap_co_dinh", "nau_nhan",
  "dua_mai", "khuon_lo_da", "dinh_da", "co_dinh_chau", "danh_bong", "hoan_thien"];
const CRAFT_UI = NEW_STEPS.filter((s) => s !== "hoan_thien");
const NEW_SET = new Set(NEW_STEPS);
const ORIGINS = [
  { key: "huyk_sp", kind: "craft", label: "HuyK chế tác", hint: "Chế tác HuyK quay theo đúng mã này" },
  { key: "tho", kind: "craft", label: "Thợ xưởng", hint: "Chế tác xưởng theo thợ, cùng mã" },
  { key: "legacy", kind: "craft", label: "Kho sẵn", hint: "Clip kho cũ, chưa tách HuyK / thợ" },
  { key: "final", kind: "final", label: "Sản phẩm hoàn thiện", hint: "SP đã xong · beauty / visual của mã này" },
  { key: "huyk", kind: "huyk", label: "HuyK", hint: "HuyK nói, ra hiệu, làm nghề — dùng chung mọi mã" },
  { key: "outro", kind: "outro", label: "Outro", hint: "Clip kết video, ghép cuối mọi video mã này" },
];
const originLabel = (k) => ORIGINS.find((o) => o.key === k)?.label || k;
const isCraftOrigin = () => ORIGINS.find((o) => o.key === st.origin)?.kind === "craft";
const canSort = () => st.lib === "product" && !!st.sku && isCraftOrigin();
const isFinished = (c) => c.craft_step === "hoan_thien" || (c.roles?.product_final || 0) >= 0.5;
let covRef = { rows: [], columns: [] };
let summaryRef = { huyk: 0, outro: 0, illus: 0, skus: {} };
let extraFolders = [];
const SKU_KIND = { N: "nhan", L: "lac_tay", B: "bong_tai", K: "day_chuyen", D: "day_chuyen", O: "bong_tai" };
const skuKind = (sku) => SKU_KIND[String(sku || "").trim().charAt(0).toUpperCase()] || "khac";
const readyRows = () => (covRef.rows || []).filter((r) => r.ready);
const libOf = (c) => (c.library === "huyk" ? "huyk" : c.library === "outro" ? "outro" : c.library === "illus" ? "illus" : "product");
const readySkus = () => new Set((covRef.rows || []).filter((r) => r.ready).map((r) => r.sku));
const shownProduct = (c) => libOf(c) !== "product" || (c.product_set && readySkus().has(c.product_set));
const isCraft = (c) => !!(c.craft_step && c.craft_step !== "hoan_thien" && c.craft_step !== "__unsorted");
const originOf = (c) => c.craft_origin || "legacy";
const catOf = (c) => c.category || (c.library === "broll" ? "product" : "khac");
const gkey = (c) => (c.library === "illus" ? `topic:${c.topic || ""}` : c.huyk_kind === "talk" ? `talk:${c.huyk_stock || "Chung"}` : c.huyk_kind || "craft");
const MK = { vn: "VN", jp: "JP", eu: "EU", us: "US", th: "TH", id: "ID", tw: "TW", kr: "KR", cn: "CN" };
const ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="14" r="6"/><path d="M9.5 6.5L12 4l2.5 2.5L12 9z"/></svg>';
const dur = (c) => (c.usable ? (c.usable[1] - c.usable[0] + 0.05).toFixed(1) + "s" : "");
const unsorted = (c) => !NEW_SET.has(c.craft_step);
const isStill = (c) => c.upload_kind === "image" || c.tech?.codec === "image" || c.tags?.motion_level === 1;
function shootOf(c) {
  const folder = String(c.source_rel || "").split("/").find((p) => /^\d{6}[_-]/.test(p)) || "";
  if (!folder) return { key: "", label: "" };
  const date = folder.slice(0, 6);
  const staff = (folder.match(/_([A-Za-z]{2,4}\d{2})$/) || [])[1] || "";
  return { key: folder, label: staff ? `${date} · ${staff.toUpperCase()}` : date };
}

function matchOrigin(c) {
  if (!st.origin) return true;
  if (st.origin === "final") return isFinished(c);
  if (st.origin === "huyk") return libOf(c) === "huyk";
  if (st.origin === "outro") return libOf(c) === "outro";
  return originOf(c) === st.origin && !isFinished(c);
}
function productClips(lib, sku = st.sku) {
  return lib.filter((c) => libOf(c) === "product" && shownProduct(c) && c.product_set === sku && (!st.cat || catOf(c) === st.cat));
}
function originStats(of) {
  const pack = (key) => {
    const list = of.filter((c) => originOf(c) === key && !isFinished(c));
    return { n: list.length, cov: CRAFT_UI.filter((s) => list.some((c) => c.craft_step === s)).length, total: CRAFT_UI.length, thumb: list[0]?.thumb };
  };
  return ORIGINS.filter((o) => o.kind === "craft").map((o) => ({ ...o, ...pack(o.key) })).filter((o) => o.n > 0);
}
function inLib(c) {
  if (st.lib !== "product") return libOf(c) === st.lib;
  if (!st.sku) return libOf(c) === "product" && shownProduct(c);
  if (st.origin === "huyk") return libOf(c) === "huyk";
  if (st.origin === "outro") return libOf(c) === "outro";
  if (st.origin === "final") return libOf(c) === "product" && c.product_set === st.sku && isFinished(c);
  if (st.origin) return libOf(c) === "product" && c.product_set === st.sku && originOf(c) === st.origin && !isFinished(c);
  return libOf(c) === "product" && shownProduct(c) && c.product_set === st.sku;
}
function cats(lib) {
  const m = new Map(KINDS.map((k) => [k.key, { ...k, n: 0 }]));
  const rows = readyRows();
  if (rows.length) {
    rows.forEach((r) => {
      const k = r.category || skuKind(r.sku);
      if (!m.has(k)) m.set(k, { key: k, label: r.category_label || k, n: 0 });
      m.get(k).n += 1;
    });
    return [...m.values()].filter((c) => c.n > 0);
  }
  lib.filter((c) => inLib(c)).forEach((c) => {
    const k = catOf(c);
    if (!m.has(k)) m.set(k, { key: k, label: c.category_label || k, n: 0 });
    m.get(k).n += 1;
  });
  return [...m.values()].filter((c) => c.n > 0);
}
function skuClips(lib, sku = st.sku) {
  return productClips(lib, sku).filter(matchOrigin);
}
function skuRows(lib, cov) {
  const q = st.q.trim().toLowerCase();
  return (cov.rows || []).filter((r) => r.ready).filter((r) => {
    if (st.cat && (r.category || skuKind(r.sku)) !== st.cat) return false;
    if (!q) return true;
    return `${r.sku} ${r.name || ""}`.toLowerCase().includes(q);
  }).map((r) => {
    const of = lib.filter((c) => c.product_set === r.sku);
    const n = of.length || r.clips || 0;
    return { key: r.sku, label: r.sku, sub: r.name, n, thumb: of[0]?.thumb || r.thumb };
  });
}
function stepRows(lib) {
  const clips = skuClips(lib);
  const row = (step, list, label) => ({
    key: step, label, sub: list.length ? "" : "kéo clip vào đây",
    n: list.length, thumb: list[0]?.thumb, drop: true,
  });
  return [row("__unsorted", clips.filter(unsorted), "Chưa xếp"),
    ...CRAFT_UI.map((step) => row(step, clips.filter((c) => c.craft_step === step), STEP_VI[step]))];
}
function originRows(lib) {
  const of = productClips(lib);
  const final = of.filter(isFinished);
  const huyk = lib.filter((c) => libOf(c) === "huyk");
  const outro = lib.filter((c) => libOf(c) === "outro");
  const extra = [
    { key: "final", label: "Sản phẩm hoàn thiện", sub: "SP đã xong · beauty / visual của mã này", n: final.length, thumb: final[0]?.thumb },
    { key: "huyk", label: "HuyK", sub: "Nói, ra hiệu, làm nghề — dùng chung mọi mã", n: huyk.length || summaryRef.huyk || 0, thumb: huyk[0]?.thumb },
    { key: "outro", label: "Outro", sub: "Ghép cuối video của mã này", n: outro.length || summaryRef.outro || 0, thumb: outro[0]?.thumb },
  ];
  return [
    ...originStats(of).map((o) => ({ key: o.key, label: o.label, sub: o.hint, n: o.n, cov: o.cov, total: o.total, thumb: o.thumb })),
    ...extra,
  ];
}
function groups(lib, cov) {
  if (st.lib === "product") {
    if (!st.sku) return skuRows(lib, cov);
    if (!st.origin) return originRows(lib);
    if (isCraftOrigin()) return stepRows(lib);
    if (st.origin === "huyk") {
      const clips = lib.filter((c) => libOf(c) === "huyk");
      const by = new Map();
      clips.forEach((c) => { const k = gkey(c); if (!by.has(k)) by.set(k, []); by.get(k).push(c); });
      const name = (k) => (k.startsWith("talk:") ? `HuyK Talk · ${k.slice(5)}` : { gesture: "HuyK ra hiệu · nhìn", machine: "Máy móc · xưởng", craft: "HuyK làm nghề" }[k] || k);
      return [...by.entries()].map(([k, list]) => ({ key: k, label: name(k), n: list.length, thumb: list[0]?.thumb }));
    }
    if (st.origin === "outro") {
      const clips = lib.filter((c) => libOf(c) === "outro");
      const by = new Map();
      clips.forEach((c) => {
        const k = c.outro_kind === "huyk" ? "huyk" : `batch:${c.batch || "khac"}`;
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(c);
      });
      return [...by.entries()].sort((a, b) => (a[0] === "huyk" ? -1 : b[0] === "huyk" ? 1 : 0))
        .map(([k, list]) => ({ key: k, label: k === "huyk" ? "Outro HuyK · VN" : list[0].step_label || "Đợt quay", n: list.length, thumb: list[0]?.thumb }));
    }
    return [];
  }
  const clips = lib.filter((c) => inLib(c));
  const by = new Map();
  clips.forEach((c) => {
    const key = st.lib === "outro" ? (c.outro_kind === "huyk" ? "huyk" : `batch:${c.batch || "khac"}`) : gkey(c);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(c);
  });
  const name = (k, list) => (st.lib === "outro" ? (k === "huyk" ? "Outro HuyK · VN" : list[0].step_label || "Đợt quay")
    : k.startsWith("talk:") ? `HuyK Talk · ${k.slice(5)}` : k.startsWith("topic:") ? k.slice(6) : { gesture: "HuyK ra hiệu · nhìn", machine: "Máy móc · xưởng", craft: "HuyK làm nghề" }[k] || k);
  return [...by.entries()].sort((a, b) => (a[0] === "huyk" ? -1 : b[0] === "huyk" ? 1 : a[0].localeCompare(b[0])))
    .map(([k, list]) => ({ key: k, label: name(k, list), sub: st.lib === "outro" && k === "huyk" ? "Tự ghép cuối mọi video" : "", n: list.length, thumb: list[0]?.thumb }));
}
function matchesStep(c, key) {
  if (!key) return true;
  if (key === "__unsorted") return unsorted(c);
  return c.craft_step === key;
}
function inGroup(c) {
  if (st.lib === "product") {
    if (!st.sku || !st.origin) return false;
    if (st.origin === "huyk") return !st.group || gkey(c) === st.group;
    if (st.origin === "outro") return !st.group || (st.group === "huyk" ? c.outro_kind === "huyk" : `batch:${c.batch || "khac"}` === st.group);
    if (st.origin === "final") return isFinished(c) && c.product_set === st.sku;
    if (c.product_set !== st.sku) return false;
    if (st.cat && catOf(c) !== st.cat) return false;
    return matchesStep(c, st.step);
  }
  if (!st.group) return true;
  if (st.lib === "outro") return st.group === "huyk" ? c.outro_kind === "huyk" : `batch:${c.batch || "khac"}` === st.group;
  return gkey(c) === st.group;
}
function clipsOf(lib) {
  const q = st.q.trim().toLowerCase();
  if (st.lib === "product" && (!st.sku || !st.origin)) return [];
  return lib.filter((c) => inLib(c) && inGroup(c)
    && (st.lib === "product" && !st.sku ? true : !q || `${c.name} ${c.description_vi} ${c.step_label || ""} ${STEP_VI[c.craft_step] || ""} ${c.product_set || ""}`.toLowerCase().includes(q)));
}
function header(lib, src) {
  const n = (k) => {
    if (k === "product") {
      const rows = readyRows();
      if (rows.length) return rows.length;
      const skus = summaryRef.skus || {};
      return Object.keys(skus).length;
    }
    if (k === "huyk" || k === "illus" || k === "outro") return Number(summaryRef[k] || 0);
    return lib.filter((c) => libOf(c) === k).length;
  };
  const busy = src.state === "scanning";
  return `<header class="ph-bar"><h1>Kho footage</h1>
    <div class="seg" role="tablist" aria-label="Kho">${Object.entries(LIBS).map(([k, v]) => `<button type="button" role="tab" data-lib="${k}" aria-selected="${st.lib === k}">${v} · ${n(k)}</button>`).join("")}</div>
    <div class="sp"></div>
    <label class="search" style="width:240px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <span class="sr">Tìm footage</span><input id="f-q" type="search" placeholder="${st.lib === "product" && !st.sku ? "Tìm mã SP" : "Tìm clip, công đoạn"}" value="${esc(st.q)}"></label>
    <span class="muted small" title="Phần mềm tự kiểm tra thư mục SOURCE mỗi 10 phút và quét file mới">${src.auto_paused_until ? `Tự quét tạm dừng đến ${src.auto_paused_until}` : "Tự quét · 10 phút"}</span>
    <button class="btn" id="src-scan" type="button" ${busy || !src.exists ? "disabled" : ""} title="${esc(src.source_dir || "")}">${scanLabel(lib, src)}</button>
    ${busy ? '<button class="btn danger" id="src-cancel" type="button" title="Dừng quét · clip đã quét xong vẫn giữ lại">Hủy quét</button>' : ""}
  </header>
    ${st.lib === "product" && !st.sku ? catBar(lib) : ""}`;
}
function scanTarget(lib, src) {
  if (st.lib === "product" && st.cat) {
    const c = cats(lib).find((x) => x.key === st.cat);
    if (c?.folder) return { folder: c.folder, label: c.label };
  }
  return { only: st.lib === "product" ? "product" : st.lib, label: LIBS[st.lib] };
}
function scanLabel(lib, src) {
  if (src.state === "scanning") {
    const what = src.folder ? src.folder.replace(/^\d+\.\s*/, "") + " " : src.only ? LIBS[src.only] || "" : "";
    return src.step || `Đang quét ${what}${src.done}/${src.total}`;
  }
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>Quét ${esc(scanTarget(lib, src).label)}`;
}
function catBar(lib) {
  const cs = cats(lib);
  const allKind = readyRows().length || lib.filter((c) => inLib(c)).length;
  const b = (k, l, n) => `<button type="button" class="pill" data-cat="${esc(k)}" aria-pressed="${st.cat === k}">${esc(l)} <span class="mono muted">${n}</span></button>`;
  return `<div class="fcats" role="group" aria-label="Loại sản phẩm">${b("", "Tất cả loại", allKind)}${cs.map((c) => b(c.key, c.label, c.n)).join("")}</div>`;
}
function sideList(lib, gs) {
  if (st.lib === "product" && st.sku && st.origin) {
    const meta = (covRef.rows || []).find((r) => r.sku === st.sku);
    const back = `<button type="button" class="lrow" data-back-origin="1"><span class="ic">${ICON}</span>
      <span class="bd"><span class="t1"><b>← Nguồn của mã</b></span><span class="muted small">Chế tác, hoàn thiện, HuyK</span></span></button>
      <div class="lrow on" style="pointer-events:none"><span class="ic"></span>
        <span class="bd"><span class="t1"><b class="mono">${esc(st.sku)}</b></span>
          <span class="muted small">${esc(originLabel(st.origin))} · ${esc(meta?.name || "")}</span></span></div>`;
    if (isCraftOrigin()) {
      const rows = gs.map((g) => `<button type="button" class="lrow${st.step === g.key ? " on" : ""}${g.n ? "" : " empty"}" data-step="${esc(g.key)}" data-drop-step="${esc(g.key)}">
        <span class="ic">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}</span>
        <span class="bd"><span class="t1"><b>${esc(g.label)}</b><span class="muted small">${g.n} clip</span></span>
          <span class="muted small">${esc(g.sub || "")}</span></span></button>`).join("");
      return `${back}<button type="button" class="lrow${!st.step ? " on" : ""}" data-step=""><span class="ic">${ICON}</span><span class="bd"><span class="t1"><b>Tất cả clip nguồn này</b></span></span></button>${rows}`;
    }
    const allKey = st.origin === "final" ? "data-step=\"\"" : "data-group=\"\"";
    const rows = gs.map((g) => `<button type="button" class="lrow${st.group === g.key ? " on" : ""}" data-group="${esc(g.key)}">
      <span class="ic">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}</span>
      <span class="bd"><span class="t1"><b>${esc(g.label)}</b><span class="muted small">${g.n} clip</span></span></span></button>`).join("");
    return `${back}<button type="button" class="lrow${!st.group ? " on" : ""}" ${allKey}><span class="ic">${ICON}</span><span class="bd"><span class="t1"><b>Tất cả clip nguồn này</b></span></span></button>${rows}`;
  }
  if (st.lib === "product" && st.sku) {
    const meta = (covRef.rows || []).find((r) => r.sku === st.sku);
    const back = `<button type="button" class="lrow" data-back-skus="1"><span class="ic">${ICON}</span>
      <span class="bd"><span class="t1"><b>← Mã sản phẩm</b></span><span class="muted small">Chọn mã khác</span></span></button>
      <div class="lrow on" style="pointer-events:none"><span class="ic"></span>
        <span class="bd"><span class="t1"><b class="mono">${esc(st.sku)}</b></span>
          <span class="muted small">${esc(meta?.name || "")}</span></span></div>`;
    const rows = gs.map((g) => `<button type="button" class="lrow${g.n ? "" : " empty"}" data-origin="${esc(g.key)}">
      <span class="ic">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}</span>
      <span class="bd"><span class="t1"><b>${esc(g.label)}</b><span class="muted small">${g.n} clip</span></span>
        <span class="muted small">${esc(g.sub || "")}</span></span></button>`).join("");
    return `${back}${rows}`;
  }
  const row = (g) => `<button type="button" class="lrow${(st.lib === "product" ? st.sku : st.group) === g.key ? " on" : ""}${g.n ? "" : " empty"}" data-${st.lib === "product" ? "sku" : "group"}="${esc(g.key)}">
    <span class="ic">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}</span>
    <span class="bd"><span class="t1"><b class="${st.lib === "product" ? "mono" : ""}">${esc(g.label)}</b><span class="muted small">${g.n} clip</span></span>
      ${g.sub ? `<span class="muted small">${esc(g.sub)}</span>` : ""}</span></button>`;
  const all = st.lib === "product" ? "" : `<button type="button" class="lrow${!st.group ? " on" : ""}" data-group=""><span class="ic">${ICON}</span><span class="bd"><span class="t1"><b>Tất cả</b></span></span></button>`;
  return `${all}${gs.map(row).join("")}`;
}
function mainHead(lib, gs) {
  if (st.lib === "product" && !st.sku) {
    return `<div><h2 style="margin:0;font-size:18px;font-weight:700">Chọn một mã sản phẩm</h2>
      <p class="muted" style="margin:8px 0 0">Bấm mã → xem hết source của mã đó: chế tác HuyK, thợ, SP hoàn thiện, HuyK, outro.</p></div>`;
  }
  if (st.lib === "product" && st.sku && !st.origin) {
    const meta = (covRef.rows || []).find((r) => r.sku === st.sku);
    return `<div><h2 style="margin:0;font-size:18px;font-weight:700;font-family:var(--mono)">${esc(st.sku)}</h2>
      <p class="muted" style="margin:8px 0 0">${esc(meta?.name || "")} · Mọi nguồn dùng khi dựng video mã này.</p></div>`;
  }
  const g = st.lib === "product" ? gs.find((x) => x.key === st.step) : gs.find((x) => x.key === st.group);
  const meta = (covRef.rows || []).find((r) => r.sku === st.sku);
  if (canSort()) {
    return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <button type="button" class="btn" data-back-origin="1">← Nguồn</button>
      <h2 style="margin:0;font-size:18px;font-weight:700;font-family:var(--mono)">${esc(st.sku)}</h2>
      <span class="muted">${esc(meta?.name || "")}${meta?.name ? " · " : ""}${esc(originLabel(st.origin))}</span></div>`;
  }
  const title = st.lib === "product" ? `${st.sku} · ${originLabel(st.origin)}` : (g ? g.label : `Tất cả ${LIBS[st.lib]}`);
  const sub = st.lib === "product" ? (st.step ? (STEP_VI[st.step] || "Chưa xếp") : (meta?.name || "")) : (g?.sub || "");
  let chips = "";
  if (st.lib === "outro") {
    chips = ["Thị trường Việt Nam", "Voice tiếng Việt", "Dọc 1080×1920", st.group === "huyk" || !st.group ? "Tự ghép cuối mọi video" : "Chọn tay trong Studio"]
      .map((x) => `<span class="stepchip on"><span class="dot ok"></span>${x}</span>`).join("");
  }
  return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <h2 style="margin:0;font-size:18px;font-weight:700;${st.lib === "product" ? "font-family:var(--mono)" : ""}">${esc(title)}</h2>
      <span class="muted">${clipsOf(lib).length} clip${sub ? " · " + esc(sub) : ""}</span></div>
    ${chips ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${chips}</div>` : ""}`;
}
let usage = {};
const PAGE = 60;
function card(c, lb) {
  const [n, done] = usage[c.id] || [0, 0];
  const tick = canSort() && st.checked.has(c.id);
  return `<button type="button" class="cclip${st.picked === c.id ? " sel" : ""}${tick ? " tick" : ""}" data-clip="${esc(c.id)}" ${canSort() ? "draggable=\"true\"" : ""}>
      <span class="tmb">${thumbImg(c.thumb, c.name)}<span class="lb ${isCraft(c) ? "craft" : st.lib}">${lb}${c.market && MK[c.market] ? " · " + MK[c.market] : ""}</span><span class="tc">${dur(c)}</span>
        ${canSort() ? `<span class="cchk" data-check="${esc(c.id)}" role="checkbox" aria-checked="${tick ? "true" : "false"}" aria-label="Chọn clip"></span>` : ""}
        <span class="uc${n ? "" : " zero"}" title="${n ? `Đã dùng trong ${n} video · ${done} đã xuất` : "Chưa dùng trong video nào"}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>${n} lần</span></span>
      <span class="meta"><span>${esc(clipTitle(c))}</span><span class="dot ${c.tags?.aesthetic >= 3 ? "ok" : "warn"}"></span></span></button>`;
}
const clipTitle = (c) => {
  if (st.lib === "outro") return c.step_label || c.name;
  const step = STEP_VI[c.craft_step] || (unsorted(c) ? (c.step_label || "Chưa xếp") : "");
  return step || c.description_vi || c.name;
};
const LB = (c) => (c?.library === "broll" ? "SƯU TẦM" : libOf(c) === "outro" || st.origin === "outro" ? "OUTRO" : libOf(c) === "huyk" || st.origin === "huyk" ? "HUYK"
  : isFinished(c) || st.origin === "final" ? "HOÀN THIỆN" : originOf(c) === "huyk_sp" ? "HUYK CT" : originOf(c) === "tho" ? "THỢ" : isCraft(c) ? "CHẾ TÁC" : "SP");
const moreRow = (shown, total) => (total > shown ? `<div class="pager fmore" style="justify-content:center"><span class="muted small">${shown}/${total} · kéo xuống để xem thêm</span></div>` : total > PAGE ? `<div class="pager" style="justify-content:center"><span class="muted small">Đã hiện hết ${total} clip</span></div>` : "");

function skuCard(g) {
  return `<button type="button" class="skucard" data-sku="${esc(g.key)}">
      <span class="tmb">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}
        <span class="tc">${g.n} clip</span></span>
      <span class="skumeta"><b class="mono">${esc(g.label)}</b>
        <span class="muted small">${esc(g.sub || "—")}</span>
      </span></button>`;
}
function originCard(g) {
  return `<button type="button" class="skucard" data-origin="${esc(g.key)}">
      <span class="tmb">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}
        <span class="tc">${g.n} clip</span></span>
      <span class="skumeta"><b>${esc(g.label)}</b>
        <span class="muted small">${esc(g.sub || "")}</span>
      </span></button>`;
}
function boardClips(lib) {
  let list = skuClips(lib);
  if (st.hideStill) list = list.filter((c) => !isStill(c));
  if (st.shoot) list = list.filter((c) => shootOf(c).key === st.shoot);
  const q = st.q.trim().toLowerCase();
  if (q) list = list.filter((c) => `${c.name} ${c.step_label || ""} ${c.product_set || ""} ${STEP_VI[c.craft_step] || ""}`.toLowerCase().includes(q));
  return list;
}
function stepBoards(clips) {
  if (st.board === "tag") {
    const order = ["__unsorted", ...NEW_STEPS];
    return order.map((step, i) => {
      const list = clips.filter((c) => (step === "__unsorted" ? unsorted(c) : c.craft_step === step));
      if (!list.length) return null;
      return { drop: step, idx: i + 1, label: step === "__unsorted" ? "Chưa xếp" : (STEP_VI[step] || step), tag: step === "__unsorted" ? "" : step, clips: list };
    }).filter(Boolean);
  }
  const by = new Map();
  clips.forEach((c) => {
    const idx = c.step_index || 999;
    const label = unsorted(c) && !c.step_label ? "Chưa xếp" : (c.step_label || STEP_VI[c.craft_step] || "Chưa xếp");
    const key = `${idx}|${label}`;
    if (!by.has(key)) by.set(key, { idx, label, tag: c.craft_step && NEW_SET.has(c.craft_step) ? c.craft_step : "", clips: [] });
    by.get(key).clips.push(c);
  });
  extraFolders.forEach((f) => {
    const idx = Number(f.idx) || 999;
    const label = String(f.label || "").trim();
    if (!label || label === "Chưa xếp") return;
    if ([...by.values()].some((r) => r.label === label)) return;
    const key = `${idx}|${label}`;
    if (!by.has(key)) by.set(key, { idx, label, tag: "", clips: [] });
  });
  return [...by.values()].sort((a, b) => a.idx - b.idx || a.label.localeCompare(b.label, "vi")).map((row, i) => ({
    ...row, drop: row.tag || "__folder", idx: row.idx === 999 ? i + 1 : row.idx,
  }));
}
function craftBoard(lib) {
  const all = skuClips(lib).filter((c) => !st.hideStill || !isStill(c));
  const shoots = new Map();
  all.forEach((c) => {
    const s = shootOf(c);
    if (!s.key) return;
    shoots.set(s.key, { ...s, n: (shoots.get(s.key)?.n || 0) + 1 });
  });
  const chips = [...shoots.values()].sort((a, b) => b.n - a.n);
  const rows = stepBoards(boardClips(lib));
  const cm = st.composer || {};
  const tools = `<div class="ftools">
      <button type="button" class="pill" data-board="index" aria-pressed="${st.board === "index"}">Theo số thứ mục</button>
      <button type="button" class="pill" data-board="tag" aria-pressed="${st.board === "tag"}">Gom theo tag công đoạn</button>
      <button type="button" class="pill" data-still aria-pressed="${st.hideStill}">Ẩn clip tĩnh</button>
      <div class="sp"></div>
      <button type="button" class="btn pri" data-step-add="1">Thêm công đoạn</button>
    </div>
    ${cm.kind === "add" ? `<form id="f-step-form" class="fadd" data-step-kind="add">
      <label for="f-step-name">Tên công đoạn</label>
      <input class="in" id="f-step-name" name="name" value="${esc(cm.name || "")}" placeholder="Ví dụ: Khò mềm lần 2" autocomplete="off">
      <button type="submit" class="btn pri">Thêm</button>
      <button type="button" class="btn" data-step-cancel="1">Hủy</button>
      ${cm.err ? `<p class="ferr">${esc(cm.err)}</p>` : ""}
    </form>` : ""}
    ${st.boardErr ? `<p class="ferr">${esc(st.boardErr)}</p>` : ""}
    <div class="fshoots"><span class="muted small">Lần quay</span>
      <button type="button" class="pill" data-shoot="" aria-pressed="${!st.shoot}">Tất cả</button>
      ${chips.map((s) => `<button type="button" class="pill" data-shoot="${esc(s.key)}" aria-pressed="${st.shoot === s.key}">${esc(s.label)} <span class="mono muted">${s.n} clip</span></button>`).join("")}
      <span class="muted small">Mỗi video chỉ lấy source của một lần quay, không trộn.</span>
    </div>
    <p class="muted small" style="margin:0">Tick nhiều clip rồi kéo một clip trong cụm sang công đoạn khác. Chưa tick thì kéo từng clip. Cmd/Ctrl click để chọn thêm, Shift click chọn dải.</p>
    ${st.checked.size ? `<div class="fpick" id="f-picked">Đã chọn <b>${st.checked.size}</b> clip — kéo cả cụm sang công đoạn khác.
      <button type="button" class="btn sm" data-uncheck>Bỏ chọn</button></div>` : ""}`;
  if (!rows.length) return `${tools}<div class="empty">Không có clip ở lần quay này.</div>`;
  const body = rows.map((row) => {
    const editing = cm.kind === "edit" && Number(cm.idx) === Number(row.idx) && cm.label === row.label;
    const deleting = cm.kind === "del" && Number(cm.idx) === Number(row.idx) && cm.label === row.label;
    const locked = row.label === "Chưa xếp";
    const title = editing
      ? `<form id="f-step-form" class="fedit" data-step-kind="edit">
          <label class="sr-only" for="f-step-name">Tên công đoạn</label>
          <input class="in" id="f-step-name" name="name" value="${esc(cm.name ?? row.label)}" autocomplete="off">
          ${cm.err ? `<p class="ferr">${esc(cm.err)}</p>` : ""}
        </form>`
      : `<span class="fstep-t"><b>${esc(row.label)}</b>
          <span class="muted small">${row.clips.length} clip${deleting ? " · clip sẽ chuyển về Chưa xếp" : ""}</span>
          ${cm.err && deleting ? `<p class="ferr">${esc(cm.err)}</p>` : ""}
        </span>`;
    const act = deleting
      ? `<button type="button" class="btn sm pri" data-step-del-ok="${esc(row.label)}" data-step-idx="${row.idx}">Xóa mục</button>
         <button type="button" class="btn sm" data-step-cancel="1">Hủy</button>`
      : editing
        ? `<button type="submit" form="f-step-form" class="btn sm pri">Lưu</button>
           <button type="button" class="btn sm" data-step-cancel="1">Hủy</button>`
        : `<button type="button" class="btn sm" data-check-row="${esc(row.label)}" data-step-idx="${row.idx}">${row.clips.length && row.clips.every((c) => st.checked.has(c.id)) ? "Bỏ chọn" : "Chọn hết"}</button>
           <button type="button" class="btn sm" data-step-edit="${esc(row.label)}" data-step-idx="${row.idx}">Sửa</button>
           ${locked ? "" : `<button type="button" class="btn sm" data-step-del="${esc(row.label)}" data-step-idx="${row.idx}">Xóa</button>`}`;
    return `<section class="fstep" data-drop-step="${esc(row.drop)}" data-drop-idx="${row.idx}" data-drop-label="${esc(row.label)}">
      <div class="fstep-h">
        <span class="fstep-n">${row.idx}</span>
        ${title}
        <span class="fstep-act">${act}</span>
      </div>
      <div class="fstrip">${row.clips.length ? row.clips.map((c) => card(c, LB(c))).join("") : `<span class="muted small">Kéo clip vào đây</span>`}</div>
    </section>`;
  }).join("");
  return `<div class="fboard">${tools}${body}</div>`;
}
function grid(lib) {
  if (st.lib === "product" && st.sku && isCraftOrigin()) return craftBoard(lib);
  if (st.lib === "product" && !st.sku) {
    const rows = skuRows(lib, covRef);
    if (!rows.length) return `<div class="empty">Không có mã khớp. Đổi loại hoặc ô tìm.</div>`;
    return `<div class="sku-grid">${rows.map(skuCard).join("")}</div>`;
  }
  if (st.lib === "product" && st.sku && !st.origin) {
    const rows = originRows(lib);
    if (!rows.length) return `<div class="empty">Mã này chưa có clip chế tác.</div>`;
    return `<div class="sku-grid">${rows.map(originCard).join("")}</div>`;
  }
  const list = clipsOf(lib);
  if (!list.length) {
    return `<div class="empty">${st.lib === "outro" ? "Chưa có clip outro. Bỏ video vào SOURCE\\Outro rồi bấm Quét lại."
      : st.step && st.step !== "__unsorted" ? "Chưa có clip ở công đoạn này. Kéo từ Tất cả clip mã này / Chưa xếp."
      : "Không có clip khớp."}</div>`;
  }
  return `<div class="cgrid">${list.slice(0, st.shown).map((c) => card(c, LB(c))).join("")}</div><div id="fpager">${moreRow(st.shown, list.length)}</div>`;
}
function moreClips(el, lib) {
  const list = clipsOf(lib);
  if (st.shown >= list.length) return;
  const from = st.shown;
  st.shown = Math.min(list.length, st.shown + PAGE);
  el.querySelector("#fgrid .cgrid")?.insertAdjacentHTML("beforeend", list.slice(from, st.shown).map((c) => card(c, LB(c))).join(""));
  const pg = el.querySelector("#fpager");
  if (pg) pg.innerHTML = moreRow(st.shown, list.length);
}
function preview(lib) {
  const c = lib.find((x) => x.id === st.picked);
  if (!c) return "";
  return `<div class="scrim" data-close></div><aside class="drawer" aria-label="Xem clip" style="width:min(460px,100vw)">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong class="mono small" style="word-break:break-all">${esc(c.name)}</strong>
      <button class="btn icon" type="button" data-close aria-label="Đóng">✕</button></div>
    <video src="${esc(media(c.proxy))}#t=${c.best_moment_s || 0}" controls ${c.library === "outro" ? "" : "muted"} playsinline preload="metadata" style="width:100%;max-height:62vh;background:#000;border-radius:10px"></video>
    <div class="kv"><span class="muted">Mô tả</span><span>${esc(c.description_vi || "—")}</span>
      <span class="muted">Mã</span><span class="mono">${esc(c.product_set || "—")}</span>
      <span class="muted">Nguồn</span><span>${esc(originOf(c) === "huyk_sp" ? "HuyK chế tác" : originOf(c) === "tho" ? "Thợ xưởng" : (isCraft(c) ? "Chế tác" : LIBS[libOf(c)]))}</span>
      <span class="muted">Công đoạn</span><span>${esc(STEP_VI[c.craft_step] || c.step_label || "Chưa xếp")}</span>
      <span class="muted">Dùng được</span><span class="mono">${(c.usable || []).join("–")}s</span></div></aside>`;
}

export async function render(view, ctx) {
  const el = document.createElement("div");
  el.className = "fscreen";
  view.replaceChildren(el);
  ctx.boot.library = ctx.boot.library || [];
  const pools = new Map();
  const mergeLib = () => {
    const seen = new Set();
    const out = [];
    for (const arr of pools.values()) {
      for (const c of arr) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
    ctx.boot.library = out;
    return out;
  };
  const pull = async (key, params) => {
    if (pools.has(key)) return pools.get(key);
    const { clips } = await api.library({ limit: 400, ...params });
    pools.set(key, clips || []);
    return clips || [];
  };
  el.innerHTML = '<div class="empty is-busy">Đang tải kho footage…</div>';
  let lib = mergeLib();
  let src, cov;
  const timed = (p, ms, fallback) => Promise.race([p, new Promise((res) => setTimeout(() => res(fallback), ms))]);
  let summary = { huyk: 0, outro: 0, illus: 0, skus: {} };
  [src, cov, usage, summary] = await Promise.all([
    timed(api.sourceStatus().catch(() => ({ configured: false })), 8000, { configured: false }),
    timed(api.coverage().catch(() => ({ rows: [], columns: [] })), 15000, { rows: [], columns: [] }),
    timed(api.footageUsage().catch(() => ({})), 8000, {}),
    timed(api.librarySummary().catch(() => ({ huyk: 0, outro: 0 })), 8000, { huyk: 0, outro: 0 }),
  ]);
  summaryRef = summary || summaryRef;
  const fillView = async () => {
    try {
      if (st.lib === "huyk" || st.origin === "huyk") await pull("huyk", { library: "huyk" });
      else if (st.lib === "outro" || st.origin === "outro") await pull("outro", { library: "outro" });
      else if (st.lib === "illus") await pull("illus", { library: "illus" });
      else if (st.sku) await pull(`sku:${st.sku}`, { sku: st.sku });
    } catch { /* lưới vẫn vẽ từ coverage */ }
    lib = mergeLib();
    if (st.sku && isCraftOrigin()) {
      extraFolders = (await api.emptyFolders(st.sku, st.origin).catch(() => ({ folders: [] }))).folders || [];
      const clipLabels = new Set(skuClips(lib).map((c) => (unsorted(c) && !c.step_label ? "Chưa xếp" : (c.step_label || STEP_VI[c.craft_step] || "Chưa xếp"))));
      const cleaned = extraFolders.filter((f) => {
        const label = String(f.label || "").trim();
        return label && label !== "Chưa xếp" && !clipLabels.has(label);
      });
      if (cleaned.length !== extraFolders.length) {
        extraFolders = cleaned;
        await api.saveEmptyFolders(st.sku, st.origin, extraFolders).catch(() => {});
      }
    } else extraFolders = [];
  };
  const persistFolders = async () => {
    extraFolders = stepBoards(boardClips(lib))
      .filter((r) => !r.clips.length && r.label !== "Chưa xếp")
      .map((r) => ({ idx: r.idx, label: r.label }));
    try { await api.saveEmptyFolders(st.sku, st.origin, extraFolders); } catch { /* local still paints */ }
  };
  const folderClips = (idx, label) => boardClips(lib).filter((c) => Number(c.step_index || 999) === Number(idx)
    && String(c.step_label || STEP_VI[c.craft_step] || "Chưa xếp") === String(label));
  const boardIds = () => stepBoards(boardClips(lib)).flatMap((r) => r.clips.map((c) => c.id));
  const toggleTick = (id, ev) => {
    if (ev?.shiftKey && st.lastTick) {
      const ids = boardIds();
      const a = ids.indexOf(st.lastTick);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        ids.slice(lo, hi + 1).forEach((x) => st.checked.add(x));
        st.lastTick = id;
        return;
      }
    }
    if (st.checked.has(id)) st.checked.delete(id);
    else st.checked.add(id);
    st.lastTick = id;
  };
  const moveClips = async (ids, step, idx, label) => {
    const craft = NEW_SET.has(step) || step === "__unsorted" ? step : undefined;
    const clips = [];
    for (const id of ids) {
      const clip = lib.find((c) => c.id === id);
      if (!clip || clip.product_set !== st.sku || originOf(clip) !== st.origin) continue;
      if (Number(clip.step_index || 999) === idx && String(clip.step_label || "") === String(label)) continue;
      clips.push(clip);
    }
    if (!clips.length) return 0;
    const prev = clips.map((c) => ({ c, craft_step: c.craft_step, step_label: c.step_label, step_index: c.step_index }));
    for (const c of clips) {
      if (craft) c.craft_step = craft;
      c.step_label = label;
      c.step_index = idx;
    }
    st.boardErr = "";
    paint();
    try {
      for (const c of clips) await api.setClipFolder(c.id, { step_index: idx, step_label: label, craft_step: craft });
      await persistFolders();
      return clips.length;
    } catch (err) {
      for (const p of prev) {
        p.c.craft_step = p.craft_step;
        p.c.step_label = p.step_label;
        p.c.step_index = p.step_index;
      }
      st.boardErr = err.message;
      throw err;
    }
  };
  const nameTaken = (name, skipIdx, skipLabel) => stepBoards(boardClips(lib)).some((r) =>
    r.label.trim().toLowerCase() === name.toLowerCase()
    && !(Number(r.idx) === Number(skipIdx) && r.label === skipLabel));
  const commitComposer = async () => {
    const cm = st.composer;
    if (!cm || (cm.kind !== "add" && cm.kind !== "edit")) return;
    const name = String(cm.name || el.querySelector("#f-step-name")?.value || "").trim();
    if (!name) { st.composer = { ...cm, err: "Nhập tên công đoạn" }; paint(); return; }
    if (cm.kind === "add") {
      if (nameTaken(name)) { st.composer = { ...cm, name, err: "Đã có công đoạn này" }; paint(); return; }
      const used = stepBoards(boardClips(lib)).map((r) => Number(r.idx) || 0);
      const idx = Math.max(0, ...used, ...extraFolders.map((f) => Number(f.idx) || 0)) + 1;
      extraFolders = [...extraFolders, { idx, label: name }];
      try { await api.saveEmptyFolders(st.sku, st.origin, extraFolders); st.composer = null; }
      catch (err) { st.composer = { ...cm, name, err: err.message }; }
      paint();
      return;
    }
    const old = cm.label;
    const idx = Number(cm.idx);
    if (name === old) { st.composer = null; paint(); return; }
    if (nameTaken(name, idx, old)) { st.composer = { ...cm, name, err: "Đã có công đoạn này" }; paint(); return; }
    extraFolders = extraFolders.map((f) => (Number(f.idx) === idx && f.label === old ? { ...f, label: name } : f));
    try {
      for (const c of folderClips(idx, old)) {
        c.step_label = name;
        c.step_index = idx;
        await api.setClipFolder(c.id, { step_index: idx, step_label: name });
      }
      await persistFolders();
      st.composer = null;
    } catch (err) { st.composer = { ...cm, name, err: err.message }; }
    paint();
  };
  await fillView();
  const paint = () => {
    covRef = cov || { rows: [], columns: [] };
    if (st.lib === "huyk_sp" || st.lib === "tho" || st.lib === "craft") {
      st.origin = st.lib === "huyk_sp" ? "huyk_sp" : st.lib === "tho" ? "tho" : st.origin;
      st.lib = "product";
    }
    if (st.lib === "product" && st.sku && !readySkus().has(st.sku)) { st.sku = ""; st.origin = ""; st.step = ""; }
    const gs = groups(lib, cov);
    const board = st.lib === "product" && st.sku && isCraftOrigin();
    const sideTop = el.querySelector(".side-l")?.scrollTop || 0;
    el.innerHTML = `${header(lib, src)}<div class="split${board ? " board" : ""}">
      <aside class="side-l" aria-label="Nhóm">${board ? "" : sideList(lib, gs)}</aside>
      <section class="list" id="fmain">${mainHead(lib, gs)}<div id="fgrid">${grid(lib)}</div></section></div><div id="fprev">${preview(lib)}</div>`;
    const side = el.querySelector(".side-l");
    if (side) side.scrollTop = sideTop;
    watchMore();
    const inp = el.querySelector("#f-step-name");
    if (inp && (st.composer?.kind === "add" || st.composer?.kind === "edit")) {
      inp.focus();
      const pos = inp.value.length;
      try { inp.setSelectionRange(pos, pos); } catch { /* ignore */ }
    }
  };
  let io = null;
  const watchMore = () => {
    io?.disconnect();
    const pg = el.querySelector("#fpager");
    if (!pg || !("IntersectionObserver" in window)) return;
    io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { moreClips(el, lib); io.disconnect(); requestAnimationFrame(watchMore); } },
      { root: null, rootMargin: "600px 0px" });
    io.observe(pg);
  };
  paint();
  let dragging = false;
  el.addEventListener("dragstart", (e) => {
    const card = e.target.closest?.("[data-clip]");
    if (!card || !canSort()) return;
    if (e.target.closest?.("[data-check]")) { e.preventDefault(); return; }
    const id = card.dataset.clip;
    const ids = st.checked.has(id) && st.checked.size > 1 ? [...st.checked] : [id];
    dragging = true;
    e.dataTransfer.setData("text/plain", ids.join("\n"));
    e.dataTransfer.effectAllowed = "move";
    const mark = new Set(ids);
    el.querySelectorAll("[data-clip]").forEach((n) => { if (mark.has(n.dataset.clip)) n.classList.add("dragging"); });
    if (ids.length > 1) {
      const ghost = document.createElement("div");
      ghost.className = "cdrag-ghost";
      ghost.textContent = `${ids.length} clip`;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 28, 16);
      requestAnimationFrame(() => ghost.remove());
    }
  });
  el.addEventListener("dragover", (e) => {
    const row = e.target.closest?.("[data-drop-step]");
    if (!row || !canSort()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    el.querySelectorAll(".drop-on").forEach((x) => x.classList.remove("drop-on"));
    row.classList.add("drop-on");
  });
  el.addEventListener("dragleave", (e) => {
    const row = e.target.closest?.("[data-drop-step]");
    if (row && !row.contains(e.relatedTarget)) row.classList.remove("drop-on");
  });
  el.addEventListener("drop", async (e) => {
    const row = e.target.closest?.("[data-drop-step]");
    const ids = (e.dataTransfer.getData("text/plain") || "").split("\n").map((x) => x.trim()).filter(Boolean);
    el.querySelectorAll(".drop-on,.cclip.dragging").forEach((x) => x.classList.remove("drop-on", "dragging"));
    if (!row || !ids.length || !canSort()) return;
    e.preventDefault();
    const step = row.dataset.dropStep;
    const idx = Number(row.dataset.dropIdx || 0);
    const label = row.dataset.dropLabel || (step === "__unsorted" ? "Chưa xếp" : (STEP_VI[step] || step));
    const bad = ids.some((id) => {
      const clip = lib.find((c) => c.id === id);
      return !clip || clip.product_set !== st.sku || originOf(clip) !== st.origin;
    });
    if (bad) {
      st.boardErr = "Chỉ kéo clip của đúng mã và nguồn đang mở";
      paint();
      return;
    }
    try {
      ids.forEach((id) => st.checked.delete(id));
      const n = await moveClips(ids, step, idx, label);
      if (n) toast(n > 1 ? `Đã chuyển ${n} clip → ${label}` : `Đã chuyển sang ${label}`);
    } catch { /* boardErr set */ }
    paint();
  });
  el.addEventListener("dragend", () => {
    dragging = false;
    el.querySelectorAll(".drop-on,.cclip.dragging").forEach((x) => x.classList.remove("drop-on", "dragging"));
  });
  el.addEventListener("submit", (e) => {
    if (e.target.id !== "f-step-form") return;
    e.preventDefault();
    commitComposer();
  });
  el.addEventListener("input", (e) => {
    if (e.target.id === "f-step-name" && st.composer) {
      st.composer = { ...st.composer, name: e.target.value, err: "" };
      return;
    }
    if (e.target.id !== "f-q") return;
    st.q = e.target.value;
    st.shown = PAGE;
    if (st.lib === "product" && (!st.sku || !st.origin)) paint();
    else {
      el.querySelector("#fgrid").innerHTML = grid(lib);
      el.querySelector("#fmain").scrollTop = 0;
      watchMore();
    }
  });
  el.addEventListener("click", async (e) => {
    const box = e.target.closest("[data-check]");
    if (box) {
      e.preventDefault();
      e.stopPropagation();
      toggleTick(box.dataset.check, e);
      paint();
      return;
    }
    const t = e.target.closest("button, [data-close]");
    if (!t) return;
    if (t.hasAttribute("data-uncheck")) { clearTicks(); paint(); return; }
    if (t.dataset.checkRow !== undefined) {
      const row = t.closest("[data-drop-step]");
      const ids = [...(row?.querySelectorAll("[data-clip]") || [])].map((n) => n.dataset.clip);
      const allOn = ids.length && ids.every((id) => st.checked.has(id));
      ids.forEach((id) => (allOn ? st.checked.delete(id) : st.checked.add(id)));
      if (ids.length) st.lastTick = ids[ids.length - 1];
      paint();
      return;
    }
    if (t.dataset.lib) {
      st.lib = t.dataset.lib; st.sku = ""; st.origin = ""; st.group = st.lib === "outro" ? "huyk" : "";
      st.cat = ""; st.step = ""; st.q = ""; st.shown = 60; clearTicks(); await fillView(); paint(); return;
    }
    if (t.dataset.cat !== undefined) { st.cat = t.dataset.cat; st.sku = ""; st.step = ""; st.shown = 60; await fillView(); paint(); return; }
    if (t.hasAttribute("data-back-origin")) {
      st.origin = ""; st.step = ""; st.shoot = ""; st.shown = 60; st.composer = null; st.boardErr = "";
      clearTicks(); await fillView(); paint(); return;
    }
    if (t.dataset.origin !== undefined) { st.origin = t.dataset.origin; st.step = ""; st.group = ""; st.shown = 60; clearTicks(); await fillView(); paint(); return; }
    if (t.dataset.board) { st.board = t.dataset.board; paint(); return; }
    if (t.dataset.shoot !== undefined) { st.shoot = st.shoot === t.dataset.shoot ? "" : t.dataset.shoot; paint(); return; }
    if (t.hasAttribute("data-still")) { st.hideStill = !st.hideStill; paint(); return; }
    if (t.hasAttribute("data-step-add")) {
      st.composer = st.composer?.kind === "add" ? null : { kind: "add", name: "" };
      st.boardErr = "";
      paint();
      return;
    }
    if (t.hasAttribute("data-step-cancel")) {
      st.composer = null;
      paint();
      return;
    }
    if (t.dataset.stepEdit !== undefined) {
      st.composer = { kind: "edit", idx: Number(t.dataset.stepIdx), label: t.dataset.stepEdit, name: t.dataset.stepEdit };
      st.boardErr = "";
      paint();
      return;
    }
    if (t.dataset.stepDel !== undefined) {
      if (t.dataset.stepDel === "Chưa xếp") return;
      st.composer = { kind: "del", idx: Number(t.dataset.stepIdx), label: t.dataset.stepDel };
      st.boardErr = "";
      paint();
      return;
    }
    if (t.dataset.stepDelOk !== undefined) {
      const label = t.dataset.stepDelOk;
      const idx = Number(t.dataset.stepIdx);
      if (label === "Chưa xếp") return;
      try {
        for (const c of folderClips(idx, label)) {
          c.craft_step = "__unsorted";
          c.step_label = "Chưa xếp";
          c.step_index = 999;
          await api.setClipFolder(c.id, { step_index: 999, step_label: "Chưa xếp", craft_step: "__unsorted" });
        }
        extraFolders = extraFolders.filter((f) => !(Number(f.idx) === idx && f.label === label));
        await persistFolders();
        st.composer = null;
      } catch (err) {
        st.composer = { ...(st.composer || { kind: "del", idx, label }), err: err.message };
      }
      paint();
      return;
    }
    if (t.dataset.backSkus) { st.sku = ""; st.step = ""; st.origin = ""; st.shown = 60; clearTicks(); await fillView(); paint(); return; }
    if (t.dataset.sku !== undefined) { st.sku = t.dataset.sku; st.origin = ""; st.step = ""; st.q = ""; st.shown = 60; clearTicks(); await fillView(); paint(); return; }
    if (t.dataset.step !== undefined) { st.step = st.step === t.dataset.step ? "" : t.dataset.step; st.shown = 60; paint(); return; }
    if (t.dataset.group !== undefined) { st.group = t.dataset.group; st.shown = 60; paint(); return; }
    if (t.dataset.clip) {
      if (dragging) return;
      if (canSort() && (e.metaKey || e.ctrlKey || e.shiftKey)) { toggleTick(t.dataset.clip, e); paint(); return; }
      st.picked = t.dataset.clip;
      el.querySelector("#fprev").innerHTML = preview(lib);
      return;
    }
    if (t.hasAttribute("data-close")) { st.picked = null; el.querySelector("#fprev").innerHTML = ""; return; }
    if (t.id === "src-scan") {
      const tg = scanTarget(lib, src);
      try { src = { ...src, ...(await api.sourceScan(tg.only || "", tg.folder || "")) }; wasBusy = true; paint(); toast(`Đang quét ${tg.label}`); } catch (err) { toast(err.message, true); }
    }
    if (t.id === "src-cancel") {
      try { src = { ...src, ...(await api.sourceScanCancel()) }; paint(); toast("Đang dừng quét · clip đã quét xong vẫn giữ lại"); } catch (err) { toast(err.message, true); }
    }
  });
  let wasBusy = src.state === "scanning";
  let lastReload = Date.now();
  const reloadLib = async () => {
    pools.clear();
    await fillView();
    [cov, usage, summary] = await Promise.all([
      api.coverage().catch(() => cov),
      api.footageUsage().catch(() => usage),
      api.librarySummary().catch(() => summary),
    ]);
    lastReload = Date.now();
    paint();
  };
  let tick = 0;
  const timer = setInterval(async () => {
    tick += 1;
    if (src.state !== "scanning" && !wasBusy && tick % 4) return;
    if (src.state === "scanning") wasBusy = true;
    src = await api.sourceStatus().catch(() => src);
    const b = el.querySelector("#src-scan");
    if (b && src.state === "scanning") { b.disabled = true; b.textContent = scanLabel(lib, src); if (!el.querySelector("#src-cancel") && !st.composer) paint(); }
    if (src.state === "scanning" && Date.now() - lastReload > 45000 && !st.picked && !st.composer) await reloadLib();
    if (wasBusy && src.state !== "scanning") { await reloadLib(); toast(src.state === "cancelled" ? `Đã hủy quét · giữ ${src.clips} clip` : `Đã quét xong · ${src.clips} clip`); }
    wasBusy = src.state === "scanning";
  }, 2500);
  const onKey = (e) => {
    if (!el.getClientRects().length) return;
    if (e.key !== "Escape") return;
    if (st.composer) { e.preventDefault(); st.composer = null; paint(); return; }
    if (st.picked) { st.picked = null; el.querySelector("#fprev").innerHTML = ""; }
  };
  document.addEventListener("keydown", onKey);
  ctx.setCleanup(() => { io?.disconnect(); clearInterval(timer); document.removeEventListener("keydown", onKey); });
}
