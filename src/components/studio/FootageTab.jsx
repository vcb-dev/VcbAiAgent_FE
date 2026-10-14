// Library tab "Footage": scope/step filters over the whole clip library.
import { useState } from "react";
import { currentPart, currentShot, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { media } from "@/lib/formatHelpers";

const SCOPES = [["sku", "Đúng SKU"], ["shared", "Chung VCB"], ["collected", "Sưu tầm"], ["all", "Tất cả"]];
export const STEP_VI = { thiet_ke: "Thiết kế", chuan_bi_nguyen_lieu: "Nguyên liệu", nung_nau: "Nung chảy", do_khuon: "Đổ khuôn", dap_can: "Đập/cán",
  cua_cat: "Cưa cắt", han: "Hàn", dua_mai: "Giũa mài", khoan: "Khoan", gan_da_chu: "Gắn đá chủ", dinh_da: "Đính đá", danh_bong: "Đánh bóng", hoan_thien: "Hoàn thiện" };

export default function FootageTab({ boot, job }) {
  const [filter, setFilter] = useState({ scope: "sku", step: "" });
  const sel = useEditorStore((s) => s.sel);
  const actions = useStudioActions();

  const sku = job?.sku;
  const clips = boot.library.filter((c) => {
    const scope = c.rights === "collected" ? "collected" : c.product_set ? "sku" : "shared";
    if (filter.scope === "sku" && !(scope === "sku" && c.product_set === sku)) return false;
    if (!["all", "sku"].includes(filter.scope) && scope !== filter.scope) return false;
    return !filter.step || c.craft_step === filter.step;
  });
  const shot = currentShot(job, sel);
  const part = currentPart(job, sel);

  return (
    <>
      <div className="chips">
        {SCOPES.map(([id, l]) => (
          <button
            key={id}
            className={`small-btn ${filter.scope === id ? "on" : ""}`}
            onClick={() => setFilter((f) => ({ ...f, scope: id }))}
          >
            {l}
          </button>
        ))}
      </div>
      <select value={filter.step} onChange={(e) => setFilter((f) => ({ ...f, step: e.target.value }))}>
        <option value="">Mọi công đoạn</option>
        {Object.entries(STEP_VI).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <p className="hint" style={{ margin: "8px 0" }}>
        {shot ? (
          <>
            Bấm một clip để thay vào{" "}
            <b>
              {part.role_label} · shot {shot.index + 1}
            </b>
            .
          </>
        ) : (
          "Dựng video trước, rồi chọn shot trên timeline."
        )}{" "}
        {sku ? "" : "Chọn bộ footage sản phẩm để lọc đúng SKU."}
      </p>
      <div className="cards">
        {clips.length ? (
          clips.map((c) => (
            <div
              key={c.id}
              className="card"
              title={c.description_vi || ""}
              onClick={() =>
                shot && actions.choose(shot.part_id, shot.index, { kind: "clip", clip_id: c.id, manual: true })
              }
            >
              <span className="badge">{c.rights === "collected" ? "SƯU TẦM" : c.product_set || "CHUNG"}</span>
              <img className="thumb" src={media(c.thumb)} alt="" loading="lazy" />
              <div className="meta">
                <b>{c.name}</b>
                {STEP_VI[c.craft_step] || c.roles[0] || ""}
              </div>
            </div>
          ))
        ) : (
          <p className="hint">Không có clip phù hợp bộ lọc.</p>
        )}
      </div>
    </>
  );
}
