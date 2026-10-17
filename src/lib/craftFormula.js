// Công thức công đoạn tuyến A4 — 4 ô chế tác theo thứ tự quy trình.
//
// Khi có công thức chính thức: chỉ sửa CRAFT_FORMULA bên dưới (và STEP_ORDER nếu
// thêm bước mới). Mỗi ô là một nhóm bước; hệ thống lấy thư mục có sẵn của mã,
// ưu tiên bước trong nhóm, không trùng ô khác.

export const FORMULA_VALUE = "__formula__";
export const FORMULA_LABEL = "Theo thứ tự công đoạn";

/** Thứ tự quy trình kim hoàn (nhỏ → lớn = đầu → cuối). */
export const STEP_ORDER = [
  "thiet_ke",
  "chuan_bi_nguyen_lieu",
  "nung_nau",
  "do_khuon",
  "dap_can",
  "tao_dang",
  "cua_cat",
  "han",
  "dua_mai",
  "khoan",
  "gan_da_chu",
  "dinh_da",
  "lam_sach",
  "danh_bong",
  "khac_laser",
  "hoan_thien",
];

/**
 * Công thức tạm — 4 ô A4 chia đều quy trình.
 * Thay 4 mảng này khi nhận công thức chính thức.
 */
export const CRAFT_FORMULA = [
  ["thiet_ke", "chuan_bi_nguyen_lieu", "nung_nau"],
  ["do_khuon", "dap_can", "tao_dang", "cua_cat"],
  ["han", "dua_mai", "khoan", "gan_da_chu"],
  ["dinh_da", "lam_sach", "danh_bong", "khac_laser", "hoan_thien"],
];

function rank(step) {
  const i = STEP_ORDER.indexOf(step);
  return i < 0 ? 999 : i;
}

function pickForSlot(folders, wanted, usedPaths) {
  const free = folders
    .filter((f) => f?.path && !usedPaths.has(f.path))
    .sort((a, b) => (a.orderIndex ?? 99) - (b.orderIndex ?? 99) || rank(a.step) - rank(b.step));
  return free.find((f) => wanted.includes(f.step)) || free[0] || null;
}

/** Áp công thức cho cả 4 ô chế tác từ kho thư mục của mã. */
export function applyCraftFormula(folders) {
  const used = new Set();
  return CRAFT_FORMULA.map((wanted) => {
    const item = pickForSlot(folders, wanted, used);
    if (item) used.add(item.path);
    return item;
  });
}

export function isCraftClip(clip) {
  return (clip.roles || []).some((r) => r === "craft" || r === "craft_macro" || r === "craft_pov");
}

export function isHuykClip(clip) {
  return (clip.roles || []).some((r) => r === "huyk_talk" || r === "huyk_silent");
}

export function labeledCraft(library, sku, step) {
  return (library || []).filter(
    (c) => isCraftClip(c) && c.product_set === sku && (!step || c.craft_step === step),
  );
}

export function labeledHuyk(library, action) {
  const token = (action?.name || action?.folder || "").toLowerCase().trim();
  if (!token) return [];
  return (library || []).filter((c) => {
    if (!isHuykClip(c)) return false;
    const hay = `${c.name || ""} ${c.folder || ""}`.toLowerCase();
    return hay.includes(token);
  });
}

export function labeledProduct(library, sku, variant) {
  const roles = variant === "final" ? ["product_final"] : ["product_hero", "product_final", "craft_macro"];
  return (library || []).filter(
    (c) => c.product_set === sku && roles.some((r) => (c.roles || []).includes(r)),
  );
}

export function labeledOutro(library) {
  return (library || []).filter((c) => (c.roles || []).includes("outro"));
}
