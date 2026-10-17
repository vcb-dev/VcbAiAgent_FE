// Library tab "Kịch bản": chọn loại và sản phẩm, rồi chỉnh footage theo tuyến A4.
//
// Hệ thống bốc sẵn 4 công đoạn + 2 HuyK; editor đổi từng ô hoặc bốc lại cả tuyến.
// Kế hoạch này là nguồn tên công đoạn trên timeline — dựng xong cũng khóa theo đây.
import { useEffect, useMemo, useState } from "react";
import { setUi, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import {
  useA4Plan,
  useCategories,
  useCraftSteps,
  useHuykActions,
  useNasSync,
  usePrepareFootage,
  useProducts,
} from "@/features/nas/useNas";
import { money } from "@/lib/formatHelpers";
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
import { applyCraftFormula, FORMULA_LABEL, FORMULA_VALUE, labeledCraft } from "@/lib/craftFormula";
import { STEP_VI } from "./FootageTab";

function summaryRows(job) {
  const t = job.totals;
  const c = job.costs || {};
  const per = (t.gen_cost_usd || 0) + (c.vo?.est_cost_usd || 0) + (c.script_llm || 0);
  return [
    ["Thời lượng", `${t.duration.toFixed(1)}s · ${job.parts.length} phần`],
    ["Shot footage thật / AI", `${t.real_shots} / ${t.gen_shots}`],
    ["Template · planner", `${job.template_id} · ${job.planner}`],
    ["AI generate (đề xuất)", money(t.gen_cost_usd)],
    ["Lồng tiếng (ElevenLabs)", money(c.vo?.est_cost_usd)],
    ["Lập kế hoạch (LLM)", money(c.script_llm)],
    ["Chi phí AI / video", money(per)],
  ];
}

export default function ScriptTab({ boot, job }) {
  const busy = useEditorStore((s) => s.busy);
  const actions = useStudioActions();
  const sync = useNasSync();

  const [category, setCategory] = useState("");
  const [sku, setSku] = useState("");
  const [search, setSearch] = useState("");
  const [script, setScript] = useState("");

  const a4Draft = useEditorStore((s) => s.a4Draft);
  const categories = useCategories();
  const products = useProducts(category, true); // chỉ 52 mã đã có footage chế tác trên ổ
  const plan = useA4Plan(category, sku);
  const craftPool = useCraftSteps(category, sku);
  const huykPool = useHuykActions();

  // Đổi loại thì sản phẩm đang chọn không còn thuộc danh sách nữa.
  useEffect(() => {
    setSku("");
    setSearch("");
  }, [category]);

  // Tab Footage lọc theo mã này và timeline vẽ trước tuyến A4 theo nó, nên đẩy lên store chung.
  useEffect(() => setUi({ pickedSku: sku, pickedCategory: category }), [sku, category]);

  const live = !!(job && job.sku === sku);

  // Đổi mã thì bỏ bản đang chỉnh. Job cùng mã thì A4 hiện đúng công đoạn đang dùng, không bốc tổ hợp mới.
  useEffect(() => {
    const cur = useEditorStore.getState().a4Draft;
    if (!sku) {
      if (cur) setUi({ a4Draft: null });
      return;
    }
    if (cur && cur.sku !== sku) setUi({ a4Draft: null });
  }, [sku]);

  useEffect(() => {
    if (!sku || useEditorStore.getState().a4Draft?.sku === sku) return;
    if (job?.sku === sku) {
      const folders = craftPool.data || [];
      const crafts = job.parts.filter((p) => p.role === "craft");
      if (!crafts.length) return;
      const used = new Set();
      const craft = crafts.map((p, i) => {
        const saved = job.nas_plan?.craft?.[i];
        if (saved?.path || saved?.name) {
          if (saved.path) used.add(saved.path);
          return saved;
        }
        const match = folders.find((f) => f.step === p.craft_step && !used.has(f.path));
        if (match) used.add(match.path);
        return (
          match || {
            name: p.craft_label || STEP_VI[p.craft_step] || p.craft_step,
            step: p.craft_step,
            path: p.part_id,
          }
        );
      });
      setUi({
        a4Draft: {
          sku,
          shoot: job.nas_plan?.shoot || plan.data?.shoot,
          shoots: plan.data?.shoots,
          slots: withSlotIndex(job.nas_plan?.slots || A4_SLOTS),
          craft,
          huyk: job.nas_plan?.huyk?.length ? job.nas_plan.huyk : plan.data?.huyk || [],
        },
      });
      return;
    }
    if (plan.data?.sku === sku) {
      setUi({ a4Draft: { ...plan.data, sku, slots: withSlotIndex(plan.data.slots || A4_SLOTS) } });
    }
  }, [sku, job, plan.data, craftPool.data]);

  const draft = a4Draft?.sku === sku ? a4Draft : plan.data;
  const writePlan = (next) => setUi({ a4Draft: { ...next, sku } });
  const slots = withSlotIndex(draft?.slots || A4_SLOTS);

  // Ổ có hàng trăm sản phẩm nhưng chỉ mã đã dựng proxy mới render được ngay.
  const renderable = useMemo(() => new Set((boot.products || []).map((p) => p.sku)), [boot.products]);
  const product = (products.data || []).find((p) => p.sku === sku);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.data || [];
    return q ? list.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(q)) : list;
  }, [products.data, search]);

  const hasFootage = (draft?.craft?.length ?? 0) > 0;
  const ready = sku && hasFootage && script.trim().length >= 10;
  const prepare = usePrepareFootage();

  const changeKind = (index, key) => {
    const kind = SLOT_KINDS.find((k) => kindKey(k) === key);
    if (!kind || !draft) return;
    writePlan({ ...draft, slots: changeSlotKind(draft.slots || A4_SLOTS, index, kind) });
  };

  const steps = boot.craft_steps?.length
    ? boot.craft_steps
    : Object.entries(STEP_VI).map(([id, label]) => ({ id, label }));

  const pickCraftStep = (slot, stepId) => {
    if (stepId === FORMULA_VALUE) {
      applyFormula();
      return;
    }
    if (!draft || !stepId) return;
    const name = STEP_VI[stepId] || steps.find((s) => s.id === stepId)?.label || stepId;
    const folder = (craftPool.data || []).find((f) => f.step === stepId);
    writePlan(
      replaceSlot(draft, "craft", slot.at, {
        step: stepId,
        name,
        path: folder?.path || stepId,
      }),
    );
    if (live) {
      const part = job.parts.filter((p) => p.role === "craft")[slot.at];
      if (part) actions.craftStep(part.part_id, stepId, name, folder?.path || "");
    }
  };

  const pickHuykAction = (slot, path) => {
    const item = (huykPool.data || []).find((x) => x.path === path);
    if (!item || !draft) return;
    writePlan(replaceSlot(draft, "huyk", slot.at, { path: item.path, name: item.name, orderIndex: item.orderIndex }));
  };

  /** Áp công thức 4 ô chế tác. Đổi CRAFT_FORMULA trong craftFormula.js khi có công thức chính thức. */
  const applyFormula = () => {
    const picked = applyCraftFormula(craftPool.data || []);
    if (!draft || !picked.some(Boolean)) return;
    let next = draft;
    picked.forEach((item, at) => {
      if (item) next = replaceSlot(next, "craft", at, item);
    });
    writePlan(next);
    if (live) {
      actions.craftPlan(
        picked.map((x) => x?.step || x?.name || "random"),
        picked.map((x) => x?.name || ""),
        picked.map((x) => x?.path || ""),
      );
    }
  };

  const randomSlot = (slot) => {
    if (slot.from === "craft") {
      const step = draft?.craft?.[slot.at]?.step;
      if (live) {
        const part = job.parts.filter((p) => p.role === "craft")[slot.at];
        if (part) {
          actions.craftStep(
            part.part_id,
            step || "random",
            STEP_VI[step] || "",
            draft?.craft?.[slot.at]?.path || "",
          );
        }
        return;
      }
      if (!step && steps.length) pickCraftStep(slot, steps[Math.floor(Math.random() * steps.length)].id);
      return;
    }
    const pool = huykPool.data || [];
    const current = draft?.huyk?.[slot.at]?.path;
    const item = pickOther(pool, new Set((draft?.huyk || []).map((x) => x.path)), current);
    if (item) pickHuykAction(slot, item.path);
  };

  const reshuffle = async () => {
    const fresh = await plan.refetch();
    if (fresh.data) writePlan(fresh.data);
    if (live) {
      const rows = fresh.data?.craft || [];
      const steps = A4_SLOTS.filter((s) => s.from === "craft").map((_, i) => rows[i]?.step || rows[i]?.name || "random");
      const labels = A4_SLOTS.filter((s) => s.from === "craft").map((_, i) => rows[i]?.name || "");
      const paths = A4_SLOTS.filter((s) => s.from === "craft").map((_, i) => rows[i]?.path || "");
      actions.craftPlan(steps, labels, paths);
    }
  };

  /**
   * Mã chưa từng dựng thì clip vẫn nằm trên ổ mạng; kéo về trước rồi mới dựng. Chỉ tốn
   * thời gian ở lần đầu của mỗi mã.
   */
  const build = async () => {
    if (!renderable.has(sku)) {
      await prepare.mutateAsync({
        code: category,
        sku,
        craft: draft.craft.map((s) => s.path),
        huyk: draft.huyk.map((s) => s.path),
      });
    }
    actions.build({
      script,
      sku,
      template_id: "A4_v1",
      planner: "rules",
      plan: {
        category,
        shoot: draft?.shoot,
        craft: draft?.craft?.map((s) => ({ path: s.path, name: s.name, step: s.step })),
        huyk: draft?.huyk?.map((s) => ({ path: s.path, name: s.name })),
        slots: slots.map((s) => ({
          from: s.from,
          variant: s.variant,
          seconds: s.seconds,
          at: s.at,
        })),
      },
    });
  };

  return (
    <>
      {/* Bước 1 ------------------------------------------------------------ */}
      <div className="sec">
        <div className="sec-title">
          <span>1 · Loại sản phẩm</span>
          {categories.isFetching && <span className="hint">đang tải…</span>}
        </div>
        <div className="chips">
          {(categories.data || []).map((c) => (
            <button
              key={c.code}
              className={`small-btn${category === c.code ? " on" : ""}`}
              onClick={() => setCategory(c.code)}
            >
              {c.label} ({c.ready ?? c.products})
            </button>
          ))}
        </div>
        {categories.isError && <div className="hint">Không đọc được kho: {categories.error.message}</div>}
      </div>

      {/* Bước 2 ------------------------------------------------------------ */}
      {category && (
        <div className="sec">
          <div className="sec-title">
            <span>2 · Sản phẩm</span>
            <button
              className="small-btn"
              disabled={sync.products.isPending}
              onClick={() => sync.products.mutate()}
              title="Quét lại ổ NAS để cập nhật danh sách (vài phút)"
            >
              {sync.products.isPending ? "đang quét ổ…" : "↻ quét ổ"}
            </button>
          </div>
          <input
            placeholder="Tìm theo mã hoặc tên…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", marginBottom: 6 }}
          />
          <label className="field">
            <select value={sku} onChange={(e) => setSku(e.target.value)} size={8} style={{ height: "auto" }}>
              <option value="">— Chọn sản phẩm —</option>
              {visible.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {renderable.has(p.sku) ? "● " : "○ "}
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="hint">
            {products.isFetching
              ? "Đang tải danh sách…"
              : `Chỉ hiện mã đã có footage chế tác — ${visible.length} mã · ● đã có proxy, dựng được ngay`}
          </div>
        </div>
      )}

      {/* Bước 3 ------------------------------------------------------------ */}
      {sku && (
        <div className="sec">
          <div className="sec-title">
            <span>3 · Footage theo tuyến A4</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button className="small-btn" disabled={!!busy || !hasFootage} onClick={applyFormula}>
                {FORMULA_LABEL}
              </button>
              <button
                className="small-btn"
                disabled={plan.isFetching || !!busy}
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
          {draft && !hasFootage && (
            <div className="hint">Mã {sku} chưa có source chế tác trên ổ.</div>
          )}

          {hasFootage && (
            <>
              <div className="hint" style={{ marginBottom: 6 }}>
                Đổi loại ô (Sản phẩm / HuyK / Chế tác). Ô chế tác chọn công đoạn — hệ thống tự bốc video trong nhóm đó.
              </div>
              {slots.map((s, i) => {
                const current = s.from === "craft" || s.from === "huyk" ? draft?.[s.from]?.[s.at] : null;
                return (
                  <div key={i} className="a4-slot">
                    <div className="a4-slot-head">
                      <select
                        className="a4-kind"
                        value={kindKey(s)}
                        disabled={!!busy}
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
                            disabled={!!busy}
                            onChange={(e) => e.target.value && pickCraftStep(s, e.target.value)}
                          >
                            <option value={FORMULA_VALUE}>{FORMULA_LABEL}</option>
                            {!current?.step && <option value="">— chọn công đoạn —</option>}
                            {current?.step && !steps.some((st) => st.id === current.step) && (
                              <option value={current.step}>{current.name || current.step}</option>
                            )}
                            {steps.map((st) => {
                              const n = labeledCraft(boot.library, sku, st.id).length;
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
                            disabled={!!busy}
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
                            disabled={!!busy || huykPool.isLoading}
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
                          <button className="small-btn" disabled={!!busy} title="Bốc cảnh HuyK khác" onClick={() => randomSlot(s)}>
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
        </div>
      )}

      {/* Bước 4 ------------------------------------------------------------ */}
      {sku && (
        <div className="sec">
          <div className="sec-title">4 · Nội dung</div>
          <textarea
            rows="8"
            placeholder="Dán kịch bản…"
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <label className="field">
            Kịch bản mẫu{" "}
            <select
              value=""
              onChange={(e) => setScript(boot.samples.find((s) => s.id === e.target.value)?.script ?? script)}
            >
              <option value="">— Chèn mẫu —</option>
              {boot.samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>

          <button className="primary" disabled={!!busy || !ready || prepare.isPending} onClick={build}>
            {prepare.isPending ? "Đang kéo footage từ ổ…" : "▶ Dựng video"}
          </button>
          {prepare.isPending && (
            <div className="hint">
              Đang tải footage của {sku} từ ổ về máy, khoảng 3-5 phút. Dựng sẽ tự chạy tiếp ngay sau đó.
            </div>
          )}
          {prepare.isError && <div className="hint">Tải footage lỗi: {prepare.error.message}</div>}
          {!prepare.isPending && hasFootage && !renderable.has(sku) && (
            <div className="hint">
              {sku} dựng lần đầu nên sẽ tải footage từ ổ về trước, khoảng 3-5 phút. Các lần sau dựng ngay.
            </div>
          )}
          {!ready && hasFootage && script.trim().length < 10 && (
            <div className="hint">Nhập nội dung để dựng video.</div>
          )}
        </div>
      )}

      <div className="sec">
        <div className="sec-title">Tổng quan dự án</div>
        <div className="hint">
          {job
            ? summaryRows(job).map(([k, v]) => (
                <div key={k} className="stat">
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))
            : "Chưa có dự án."}
        </div>
      </div>
    </>
  );
}
