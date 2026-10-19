// Bảng chỉnh footage theo tuyến A4 — dùng chung Studio (tab Kịch bản) và Render hàng loạt.
import {
  A4_SLOTS,
  SLOT_KINDS,
  changeSlotKind,
  folderLabel,
  kindKey,
  pickOther,
  replaceSlot,
  slotSource,
  withSlotIndex,
} from "@/lib/a4Route";
import { applyCraftFormula, FORMULA_LABEL, labeledCraft, sortCraftByProcess, withFormulaCraft } from "@/lib/craftFormula";
import { STEP_VI } from "./FootageTab";

export default function A4RouteEditor({
  title = "Footage theo tuyến A4",
  sku,
  boot,
  product,
  draft,
  writePlan,
  plan,
  craftPool,
  huykPool,
  disabled,
  onCraftPicked,
  onPlanReplaced,
}) {
  const steps = boot?.craft_steps?.length
    ? boot.craft_steps
    : Object.entries(STEP_VI).map(([id, label]) => ({ id, label }));
  const slots = withSlotIndex(draft?.slots || A4_SLOTS);
  const hasFootage = (draft?.craft?.length ?? 0) > 0;

  const changeKind = (index, key) => {
    const kind = SLOT_KINDS.find((k) => kindKey(k) === key);
    if (!kind || !draft) return;
    writePlan({ ...draft, slots: changeSlotKind(draft.slots || A4_SLOTS, index, kind) });
  };

  const pickCraftStep = (slot, stepId) => {
    if (!draft || !stepId) return;
    const name = STEP_VI[stepId] || steps.find((s) => s.id === stepId)?.label || stepId;
    const folder = (craftPool.data || []).find((f) => f.step === stepId);
    const item = { step: stepId, name, path: folder?.path || stepId };
    writePlan(replaceSlot(draft, "craft", slot.at, item));
    onCraftPicked?.(slot, item);
  };

  const pickHuykAction = (slot, path) => {
    const item = (huykPool.data || []).find((x) => x.path === path);
    if (!item || !draft) return;
    writePlan(replaceSlot(draft, "huyk", slot.at, { path: item.path, name: item.name, orderIndex: item.orderIndex }));
  };

  const applyFormula = () => {
    const picked = applyCraftFormula(craftPool.data || []);
    if (!draft || !picked.some(Boolean)) return;
    let next = draft;
    picked.forEach((item, at) => {
      if (item) next = replaceSlot(next, "craft", at, item);
    });
    writePlan(next);
    onPlanReplaced?.(next);
  };

  const randomSlot = (slot) => {
    if (slot.from === "craft") {
      const current = draft?.craft?.[slot.at];
      const pool = (craftPool.data || []).filter((f) => !current?.step || f.step === current.step);
      const used = new Set((draft?.craft || []).map((x) => x.path));
      const item = pickOther(pool.length ? pool : craftPool.data || [], used, current?.path);
      if (item) {
        const next = { step: item.step, name: item.name, path: item.path };
        writePlan(replaceSlot(draft, "craft", slot.at, next));
        onCraftPicked?.(slot, next);
        return;
      }
      if (!current?.step && steps.length) pickCraftStep(slot, steps[Math.floor(Math.random() * steps.length)].id);
      else if (current) onCraftPicked?.(slot, current);
      return;
    }
    const pool = huykPool.data || [];
    const current = draft?.huyk?.[slot.at]?.path;
    const item = pickOther(pool, new Set((draft?.huyk || []).map((x) => x.path)), current);
    if (item) pickHuykAction(slot, item.path);
  };

  const reshuffle = async () => {
    const fresh = await plan.refetch();
    if (!fresh.data) return;
    const ordered = withFormulaCraft(fresh.data, craftPool.data || []);
    const next = { ...ordered, sku, slots: withSlotIndex(ordered.slots || A4_SLOTS) };
    writePlan(next);
    onPlanReplaced?.(next);
  };

  return (
    <>
      <div className="sec-title">
        <span>{title}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button className="small-btn" type="button" disabled={disabled || !hasFootage} onClick={applyFormula}>
            {FORMULA_LABEL}
          </button>
          <button
            className="small-btn"
            type="button"
            disabled={disabled || plan.isFetching}
            onClick={reshuffle}
            title="Bốc tổ hợp công đoạn khác"
          >
            {plan.isFetching ? "…" : "↻ đổi cảnh"}
          </button>
        </span>
      </div>

      {plan.isLoading && (
        <div className="hint">
          {product?.craftSyncedAt
            ? "Đang bốc cảnh…"
            : "Mã này chưa được nạp công đoạn nên đang quét ổ, có thể mất vài phút…"}
        </div>
      )}
      {plan.isError && <div className="hint">Không lấy được footage: {plan.error.message}</div>}
      {draft && !hasFootage && <div className="hint">Mã {sku} chưa có source chế tác trên ổ.</div>}

      {hasFootage && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            Đổi loại ô (Sản phẩm / HuyK / Chế tác). Ô chế tác chọn từng công đoạn; bấm nút
            “Theo thứ tự công đoạn” để sắp lại cả 4 ô theo quy trình.
          </div>
          {slots.map((s, i) => {
            const current = s.from === "craft" || s.from === "huyk" ? draft?.[s.from]?.[s.at] : null;
            return (
              <div key={i} className="a4-slot">
                <div className="a4-slot-head">
                  <select
                    className="a4-kind"
                    value={kindKey(s)}
                    disabled={disabled}
                    title="Đổi loại ô trên template"
                    onChange={(e) => changeKind(i, e.target.value)}
                  >
                    {SLOT_KINDS.map((k) => (
                      <option key={kindKey(k)} value={kindKey(k)}>
                        {k.from === "craft" && s.from === "craft" ? s.role : k.role} · {k.seconds}s
                      </option>
                    ))}
                  </select>
                  {s.from === "craft" ? (
                    <span className="slot-src">
                      <select
                        value={current?.step || ""}
                        disabled={disabled}
                        onChange={(e) => e.target.value && pickCraftStep(s, e.target.value)}
                      >
                        {!current?.step && <option value="">— chọn công đoạn —</option>}
                        {current?.step && !steps.some((st) => st.id === current.step) && (
                          <option value={current.step}>{current.name || current.step}</option>
                        )}
                        {steps.map((st) => {
                          const n = labeledCraft(boot?.library, sku, st.id).length;
                          return (
                            <option key={st.id} value={st.id}>
                              {st.label}
                              {n ? ` · ${n} clip` : ""}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        className="small-btn"
                        type="button"
                        disabled={disabled}
                        title="Bốc video ngẫu nhiên trong công đoạn này"
                        onClick={() => randomSlot(s)}
                      >
                        ↻
                      </button>
                    </span>
                  ) : s.from === "huyk" ? (
                    <span className="slot-src">
                      <select
                        value={current?.path || ""}
                        disabled={disabled || huykPool.isLoading}
                        onChange={(e) => e.target.value && pickHuykAction(s, e.target.value)}
                      >
                        {!current?.path && <option value="">— chọn cảnh HuyK —</option>}
                        {current?.path && !(huykPool.data || []).some((x) => x.path === current.path) && (
                          <option value={current.path}>{folderLabel(current)}</option>
                        )}
                        {(huykPool.data || []).map((x) => (
                          <option key={x.path} value={x.path}>
                            {folderLabel(x)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="small-btn"
                        type="button"
                        disabled={disabled}
                        title="Bốc cảnh HuyK khác"
                        onClick={() => randomSlot(s)}
                      >
                        ↻
                      </button>
                    </span>
                  ) : (
                    <b>{slotSource(s, draft, product?.name) || "—"}</b>
                  )}
                </div>
              </div>
            );
          })}
          {draft.shoots > 1 && (
            <div className="hint" style={{ marginTop: 6 }}>
              Lấy từ buổi quay {draft.shoot?.slice(0, 6)} ({draft.shoots} buổi có trên ổ)
            </div>
          )}
        </>
      )}
    </>
  );
}

export function toJobPlan(category, draft) {
  const slots = withSlotIndex(draft?.slots || A4_SLOTS);
  return {
    category,
    shoot: draft?.shoot,
    craft: sortCraftByProcess(draft?.craft).map((s) => ({ path: s.path, name: s.name, step: s.step })),
    huyk: (draft?.huyk || []).map((s) => ({ path: s.path, name: s.name })),
    slots: slots.map((s) => ({ from: s.from, variant: s.variant, seconds: s.seconds, at: s.at })),
  };
}
