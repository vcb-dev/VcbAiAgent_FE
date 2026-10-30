// Kho footage theo mã SP: chọn SKU rồi xếp công đoạn của đúng mã đó (không gộp mọi mã chung một cột).
import { api, esc, media, thumbImg, toast } from "./admin-api.js";

const st = { lib: "product", cat: "", sku: "", origin: "", step: "", group: "", q: "", shown: 60, picked: null };
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
  const clips = lib.filter((c) => inLib(c) && (!st.cat || catOf(c) === st.cat));
  const q = st.q.trim().toLowerCase();
  const skus = new Set(clips.map((c) => c.product_set).filter(Boolean));
  return cov.rows.filter((r) => r.ready && skus.has(r.sku)).filter((r) => {
    if (!q) return true;
    const of = clips.find((c) => c.product_set === r.sku);
    return `${r.sku} ${r.name || ""} ${of?.description_vi || ""}`.toLowerCase().includes(q);
  }).map((r) => {
    const of = clips.filter((c) => c.product_set === r.sku);
    const os = originStats(of);
    const filled = CRAFT_UI.filter((s) => of.some((c) => c.craft_step === s)).length;
    const ht = of.filter(isFinished).length;
    const src = [os.map((o) => `${o.label.split(" ")[0]} ${o.cov}cd`).join(" · "), ht ? `HT ${ht}` : ""].filter(Boolean).join(" · ");
    return { key: r.sku, label: r.sku, sub: r.name, n: of.length, cov: filled, total: CRAFT_UI.length, thumb: of[0]?.thumb, src };
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
    { key: "huyk", label: "HuyK", sub: "Nói, ra hiệu, làm nghề — dùng chung mọi mã", n: huyk.length, thumb: huyk[0]?.thumb },
    { key: "outro", label: "Outro", sub: "Ghép cuối video của mã này", n: outro.length, thumb: outro[0]?.thumb },
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
  const n = (k) => lib.filter((c) => libOf(c) === k && (k !== "product" || shownProduct(c))).length;
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
  const allKind = lib.filter((c) => inLib(c)).length;
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
        <span class="muted small">${g.total ? `${g.cov}/${g.total} công đoạn đã xếp` : esc(g.sub || "")}</span></span></button>`).join("");
    return `${back}${rows}`;
  }
  const row = (g) => `<button type="button" class="lrow${(st.lib === "product" ? st.sku : st.group) === g.key ? " on" : ""}${g.n ? "" : " empty"}" data-${st.lib === "product" ? "sku" : "group"}="${esc(g.key)}">
    <span class="ic">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}</span>
    <span class="bd"><span class="t1"><b class="${st.lib === "product" ? "mono" : ""}">${esc(g.label)}</b><span class="muted small">${g.n} clip</span></span>
      ${g.total ? `<span class="covbar" aria-label="${g.cov}/${g.total} công đoạn">${Array.from({ length: Math.min(g.total, 8) }, (_, i) => `<i class="${i < Math.round((g.cov / g.total) * Math.min(g.total, 8)) ? "on" : ""}"></i>`).join("")}</span>`
        : g.sub ? `<span class="muted small">${esc(g.sub)}</span>` : ""}</span></button>`;
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
  const title = st.lib === "product" ? `${st.sku} · ${originLabel(st.origin)}` : (g ? g.label : `Tất cả ${LIBS[st.lib]}`);
  const sub = st.lib === "product" ? (st.step ? (STEP_VI[st.step] || "Chưa xếp") : (meta?.name || "")) : (g?.sub || "");
  const hint = canSort() ? `<p class="muted small" style="margin:0">Kéo clip sang công đoạn bên trái. Kéo ra <b>Chưa xếp</b> nếu xếp nhầm. Chỉ clip <b>${esc(originLabel(st.origin))}</b> của mã ${esc(st.sku)}.</p>` : "";
  let chips = "";
  if (st.lib === "outro") {
    chips = ["Thị trường Việt Nam", "Voice tiếng Việt", "Dọc 1080×1920", st.group === "huyk" || !st.group ? "Tự ghép cuối mọi video" : "Chọn tay trong Studio"]
      .map((x) => `<span class="stepchip on"><span class="dot ok"></span>${x}</span>`).join("");
  }
  return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <h2 style="margin:0;font-size:18px;font-weight:700;${st.lib === "product" ? "font-family:var(--mono)" : ""}">${esc(title)}</h2>
      <span class="muted">${clipsOf(lib).length} clip${sub ? " · " + esc(sub) : ""}</span><div style="flex:1"></div>
      ${st.lib === "product" && st.sku ? `<a class="btn pri" href="/?sku=${encodeURIComponent(st.sku)}">Dựng video</a>` : ""}</div>
    ${hint}${chips ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${chips}</div>` : ""}`;
}
let usage = {};
const PAGE = 60;
function card(c, lb) {
  const [n, done] = usage[c.id] || [0, 0];
  return `<button type="button" class="cclip${st.picked === c.id ? " sel" : ""}" data-clip="${esc(c.id)}" ${canSort() ? "draggable=\"true\"" : ""}>
      <span class="tmb">${thumbImg(c.thumb, c.name)}<span class="lb ${isCraft(c) ? "craft" : st.lib}">${lb}${c.market && MK[c.market] ? " · " + MK[c.market] : ""}</span><span class="tc">${dur(c)}</span>
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
  const n = Math.min(g.total || 0, 8);
  const on = n ? Math.round((g.cov / g.total) * n) : 0;
  return `<button type="button" class="skucard" data-sku="${esc(g.key)}">
      <span class="tmb">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}
        <span class="tc">${g.n} clip</span></span>
      <span class="skumeta"><b class="mono">${esc(g.label)}</b>
        <span class="muted small">${esc(g.sub || "—")}</span>
        <span class="muted small">${esc(g.src || `${g.cov}/${g.total} công đoạn`)}</span>
        <span class="covbar" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</span>
      </span></button>`;
}
function originCard(g) {
  const n = Math.min(g.total || 0, 8);
  const on = n ? Math.round((g.cov / g.total) * n) : 0;
  return `<button type="button" class="skucard" data-origin="${esc(g.key)}">
      <span class="tmb">${g.thumb ? `<img src="${esc(media(g.thumb))}" alt="" loading="lazy" onerror="this.remove()">` : ICON}
        <span class="tc">${g.n} clip</span></span>
      <span class="skumeta"><b>${esc(g.label)}</b>
        <span class="muted small">${esc(g.sub || "")}</span>
        ${g.total ? `<span class="muted small">${g.cov}/${g.total} công đoạn đã xếp</span>
        <span class="covbar" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</span>` : ""}
      </span></button>`;
}
function grid(lib) {
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
  if (!ctx.boot.library) {
    el.innerHTML = '<div class="empty is-busy">Đang tải kho footage…</div>';
    try {
      const full = await Promise.race([
        api.bootstrap(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("AI không trả kho footage (server đang bận encode proxy). Tải lại trang.")), 25000)),
      ]);
      Object.assign(ctx.boot, { library: full.library, products: full.products, clip_count: full.clip_count });
    } catch (err) {
      el.innerHTML = `<div class="empty">${esc(err.message || err)}</div>`;
      return;
    }
  }
  let lib = ctx.boot.library;
  let src, cov;
  const timed = (p, ms, fallback) => Promise.race([p, new Promise((res) => setTimeout(() => res(fallback), ms))]);
  [src, cov, usage] = await Promise.all([
    timed(api.sourceStatus().catch(() => ({ configured: false })), 8000, { configured: false }),
    timed(api.coverage().catch(() => ({ rows: [], columns: [] })), 15000, { rows: [], columns: [] }),
    timed(api.footageUsage().catch(() => ({})), 8000, {}),
  ]);
  const paint = () => {
    covRef = cov || { rows: [], columns: [] };
    if (st.lib === "huyk_sp" || st.lib === "tho" || st.lib === "craft") {
      st.origin = st.lib === "huyk_sp" ? "huyk_sp" : st.lib === "tho" ? "tho" : st.origin;
      st.lib = "product";
    }
    if (st.lib === "product" && st.sku && !readySkus().has(st.sku)) { st.sku = ""; st.origin = ""; st.step = ""; }
    const gs = groups(lib, cov);
    const sideTop = el.querySelector(".side-l")?.scrollTop || 0;
    el.innerHTML = `${header(lib, src)}<div class="split">
      <aside class="side-l" aria-label="Nhóm">${sideList(lib, gs)}</aside>
      <section class="list" id="fmain">${mainHead(lib, gs)}<div id="fgrid">${grid(lib)}</div></section></div><div id="fprev">${preview(lib)}</div>`;
    const side = el.querySelector(".side-l");
    if (side) side.scrollTop = sideTop;
    watchMore();
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
    dragging = true;
    e.dataTransfer.setData("text/plain", card.dataset.clip);
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
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
    const id = e.dataTransfer.getData("text/plain");
    el.querySelectorAll(".drop-on,.cclip.dragging").forEach((x) => x.classList.remove("drop-on", "dragging"));
    if (!row || !id || !canSort()) return;
    e.preventDefault();
    const step = row.dataset.dropStep;
    const clip = lib.find((c) => c.id === id);
    if (!clip || clip.product_set !== st.sku || originOf(clip) !== st.origin) { toast("Chỉ kéo clip của đúng mã và nguồn đang mở", true); return; }
    const was = NEW_SET.has(clip.craft_step) ? clip.craft_step : "__unsorted";
    if (was === step) return;
    const prev = clip.craft_step;
    const prevLabel = clip.step_label;
    clip.craft_step = step;
    clip.step_label = step === "__unsorted" ? "Chưa xếp" : (STEP_VI[step] || step);
    paint();
    try {
      await api.setClipStep(id, step);
      toast(step === "__unsorted" ? "Đã kéo ra Chưa xếp" : `Đã chuyển sang ${STEP_VI[step] || step}`);
    } catch (err) {
      clip.craft_step = prev;
      clip.step_label = prevLabel;
      paint();
      toast(err.message, true);
    }
  });
  el.addEventListener("dragend", () => {
    dragging = false;
    el.querySelectorAll(".drop-on,.cclip.dragging").forEach((x) => x.classList.remove("drop-on", "dragging"));
  });
  el.addEventListener("input", (e) => {
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
    const t = e.target.closest("button, [data-close]");
    if (!t) return;
    if (t.dataset.lib) {
      st.lib = t.dataset.lib; st.sku = ""; st.origin = ""; st.group = st.lib === "outro" ? "huyk" : "";
      st.cat = ""; st.step = ""; st.q = ""; st.shown = 60; paint(); return;
    }
    if (t.dataset.cat !== undefined) { st.cat = t.dataset.cat; st.sku = ""; st.step = ""; st.shown = 60; paint(); return; }
    if (t.dataset.origin !== undefined) { st.origin = t.dataset.origin; st.step = ""; st.group = ""; st.shown = 60; paint(); return; }
    if (t.dataset.backOrigin) { st.origin = ""; st.step = ""; st.shown = 60; paint(); return; }
    if (t.dataset.backSkus) { st.sku = ""; st.step = ""; st.origin = ""; st.shown = 60; paint(); return; }
    if (t.dataset.sku !== undefined) { st.sku = t.dataset.sku; st.origin = ""; st.step = ""; st.q = ""; st.shown = 60; paint(); return; }
    if (t.dataset.step !== undefined) { st.step = st.step === t.dataset.step ? "" : t.dataset.step; st.shown = 60; paint(); return; }
    if (t.dataset.group !== undefined) { st.group = t.dataset.group; st.shown = 60; paint(); return; }
    if (t.dataset.clip) { if (dragging) return; st.picked = t.dataset.clip; el.querySelector("#fprev").innerHTML = preview(lib); return; }
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
    const boot = await api.bootstrap();
    Object.assign(ctx.boot, { library: boot.library, products: boot.products, clip_count: boot.clip_count });
    lib = boot.library; [cov, usage] = await Promise.all([api.coverage(), api.footageUsage().catch(() => usage)]); lastReload = Date.now(); paint();
  };
  let tick = 0;
  const timer = setInterval(async () => {
    tick += 1;
    if (src.state !== "scanning" && !wasBusy && tick % 4) return;
    if (src.state === "scanning") wasBusy = true;
    src = await api.sourceStatus().catch(() => src);
    const b = el.querySelector("#src-scan");
    if (b && src.state === "scanning") { b.disabled = true; b.textContent = scanLabel(lib, src); if (!el.querySelector("#src-cancel")) paint(); }
    if (src.state === "scanning" && Date.now() - lastReload > 45000 && !st.picked) await reloadLib();
    if (wasBusy && src.state !== "scanning") { await reloadLib(); toast(src.state === "cancelled" ? `Đã hủy quét · giữ ${src.clips} clip` : `Đã quét xong · ${src.clips} clip`); }
    wasBusy = src.state === "scanning";
  }, 2500);
  const onKey = (e) => { if (!el.getClientRects().length) return; if (e.key === "Escape" && st.picked) { st.picked = null; el.querySelector("#fprev").innerHTML = ""; } };
  document.addEventListener("keydown", onKey);
  ctx.setCleanup(() => { io?.disconnect(); clearInterval(timer); document.removeEventListener("keydown", onKey); });
}
