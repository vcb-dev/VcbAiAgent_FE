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
  useNasStatus,
  useNasSync,
  usePrepareFootage,
  useProducts,
} from "@/features/nas/useNas";
import { money } from "@/lib/formatHelpers";
import { A4_SLOTS, withSlotIndex } from "@/lib/a4Route";
import { sortCraftByProcess, withFormulaCraft } from "@/lib/craftFormula";
import { STEP_VI } from "./FootageTab";
import A4RouteEditor, { toJobPlan } from "./A4RouteEditor";

function voLine(job) {
  const raw = (job.parts || []).map((p) => p.vo?.provider).find(Boolean) || job.costs?.vo?.provider || "";
  const name = String(raw).toLowerCase();
  const usd = job.costs?.vo?.est_cost_usd;
  if (name.includes("minimax")) return ["Lồng tiếng (MiniMax)", money(usd)];
  if (name.includes("eleven")) return ["Lồng tiếng (ElevenLabs)", money(usd)];
  if (name.includes("upload") || name.includes("bản thu")) return ["Lồng tiếng (bản thu)", money(0)];
  if (name.includes("macos") || name.includes("giọng máy") || name.includes("say")) {
    return ["Lồng tiếng (giọng máy)", money(0)];
  }
  return ["Lồng tiếng", money(usd)];
}

function summaryRows(job) {
  const t = job.totals;
  const c = job.costs || {};
  const llm = job.planner === "rules" ? 0 : c.script_llm || 0;
  const per = (t.gen_cost_usd || 0) + (c.vo?.est_cost_usd || 0) + llm;
  return [
    ["Thời lượng", `${t.duration.toFixed(1)}s · ${job.parts.length} phần`],
    ["Shot footage thật / AI", `${t.real_shots} / ${t.gen_shots}`],
    ["Template · planner", `${job.template_id} · ${job.planner}`],
    ["AI generate (đề xuất)", money(t.gen_cost_usd)],
    voLine(job),
    ["Lập kế hoạch (LLM)", money(llm)],
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
          craft: sortCraftByProcess(craft),
          huyk: job.nas_plan?.huyk?.length ? job.nas_plan.huyk : plan.data?.huyk || [],
        },
      });
      return;
    }
    if (plan.data?.sku === sku) {
      if (craftPool.isLoading) return;
      const ordered = withFormulaCraft(plan.data, craftPool.data || []);
      setUi({ a4Draft: { ...ordered, sku, slots: withSlotIndex(ordered.slots || A4_SLOTS) } });
    }
  }, [sku, job, plan.data, craftPool.data]);

  const draft = a4Draft?.sku === sku ? a4Draft : plan.data;
  const writePlan = (next) => setUi({ a4Draft: { ...next, sku } });

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
  const nasOn = useNasStatus().data?.nas?.mounted === true;

  const liveCraft = (slot, item) => {
    if (!live) return;
    const part = job.parts.filter((p) => p.role === "craft")[slot.at];
    if (part) actions.craftStep(part.part_id, item.step || "random", item.name || "", item.path || "");
  };

  const livePlan = (next) => {
    if (!live) return;
    const rows = next?.craft || [];
    actions.craftPlan(
      rows.map((x) => x?.step || x?.name || "random"),
      rows.map((x) => x?.name || ""),
      rows.map((x) => x?.path || ""),
    );
  };

  /**
   * Mã chưa từng dựng thì clip vẫn nằm trên ổ mạng; kéo về trước rồi mới dựng. Chỉ tốn
   * thời gian ở lần đầu của mỗi mã.
   */
  const build = async () => {
    // Prod không có ổ NAS: dựng từ catalog + proxy đã có trên máy AI.
    if (nasOn && !renderable.has(sku)) {
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
      plan: toJobPlan(category, draft),
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
          <A4RouteEditor
            title="3 · Footage theo tuyến A4"
            sku={sku}
            boot={boot}
            product={product}
            draft={draft}
            writePlan={writePlan}
            plan={plan}
            craftPool={craftPool}
            huykPool={huykPool}
            disabled={!!busy}
            onCraftPicked={liveCraft}
            onPlanReplaced={livePlan}
          />
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
