// Tuyến A4: 4 công đoạn chế tác xen 2 lần HuyK, mở và đóng bằng cảnh sản phẩm.
//
// Dùng chung cho tab Kịch bản (bảng công đoạn) và timeline (bản xem trước trước khi dựng),
// để hai chỗ không mô tả cùng một tuyến theo hai kiểu khác nhau.
export const A4_SLOTS = [
  { role: "Sản phẩm", seconds: 5, from: "product", variant: "hero" },
  { role: "HuyK", seconds: 4, from: "huyk", at: 0 },
  { role: "Chế tác 1", seconds: 3, from: "craft", at: 0 },
  { role: "Chế tác 2", seconds: 3, from: "craft", at: 1 },
  { role: "Chế tác 3", seconds: 3, from: "craft", at: 2 },
  { role: "HuyK", seconds: 4, from: "huyk", at: 1 },
  { role: "Chế tác 4", seconds: 3, from: "craft", at: 3 },
  { role: "Sản phẩm hoàn thiện", seconds: 8, from: "product", variant: "final" },
  { role: "Outro", seconds: 4, from: "outro" },
];

/** Các loại ô có thể gán vào một vị trí trên tuyến — đổi thứ tự template. */
export const SLOT_KINDS = [
  { from: "product", variant: "hero", role: "Sản phẩm", seconds: 5 },
  { from: "huyk", role: "HuyK", seconds: 4 },
  { from: "craft", role: "Chế tác", seconds: 3 },
  { from: "product", variant: "final", role: "Sản phẩm hoàn thiện", seconds: 8 },
  { from: "outro", role: "Outro", seconds: 4 },
];

export const A4_TOTAL = A4_SLOTS.reduce((sum, s) => sum + s.seconds, 0);

export function kindKey(kind) {
  return kind.from === "product" ? `product:${kind.variant || "hero"}` : kind.from;
}

/** Đánh số lại Chế tác 1…n / HuyK sau khi đổi loại ô. */
export function withSlotIndex(slots) {
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

export function changeSlotKind(slots, index, kind) {
  const next = (slots || A4_SLOTS).map((s, i) =>
    i === index ? { ...s, from: kind.from, variant: kind.variant, seconds: kind.seconds } : s,
  );
  return withSlotIndex(next);
}

export function slotsTotal(slots) {
  return withSlotIndex(slots).reduce((sum, s) => sum + s.seconds, 0);
}

/** Tên thư mục NAS, kèm số thứ tự buổi quay nếu có. */
export function folderLabel(item) {
  if (!item?.name) return "";
  return `${item.orderIndex != null ? `${item.orderIndex}. ` : ""}${item.name}`;
}

/** Nguồn footage BE đã bốc cho từng slot; chuỗi rỗng nghĩa là chưa biết. */
export function slotSource(slot, plan, productName = "") {
  if (slot.from === "product") return productName;
  if (slot.from === "outro") return "kho outro";
  return folderLabel(plan?.[slot.from]?.[slot.at]);
}

/** Tên hiện trên hàng công đoạn timeline — ưu tiên footage A4, không dùng nhãn generic. */
export function slotLabel(slot, plan, productName = "") {
  if (slot.from === "product") return productName || slot.role;
  if (slot.from === "outro") return "Outro";
  return folderLabel(plan?.[slot.from]?.[slot.at]) || slot.role;
}

/** Thay một ô chế tác / HuyK trong kế hoạch A4, giữ nguyên các ô còn lại. */
export function replaceSlot(plan, kind, at, item) {
  const next = { ...plan, [kind]: [...(plan[kind] || [])] };
  next[kind][at] = item;
  return next;
}

/** Bốc một thư mục khác ô hiện tại, ưu tiên chưa dùng ở các ô cùng loại. */
export function pickOther(pool, usedPaths, currentPath) {
  const free = pool.filter((x) => x.path !== currentPath && !usedPaths.has(x.path));
  const list = free.length ? free : pool.filter((x) => x.path !== currentPath);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/** Các slot kèm mốc bắt đầu, để vẽ lên thước thời gian. */
export function slotsWithStart(slots) {
  let start = 0;
  return withSlotIndex(slots || A4_SLOTS).map((slot) => {
    const out = { ...slot, start };
    start += slot.seconds;
    return out;
  });
}
