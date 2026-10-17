// Library tab "Footage": chia theo công đoạn tuyến A4 (hoàn thiện / chế tác / HuyK / outro).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { currentPart, currentShot, useEditorStore } from "@/store/useEditorStore";
import { useStudioActions } from "@/features/studio/useStudio";
import { api } from "@/features/studio/api";
import { media } from "@/lib/formatHelpers";

// Cảnh sản phẩm và chế tác bị khoá theo đúng mã hàng — ghép chéo SKU thì ra video sai
// sản phẩm, nên backend chặn thẳng. Lọc sẵn ở đây để khỏi bấm vào rồi mới báo lỗi.
const STAGES = [
  { id: "product", label: "Hoàn thiện", roles: ["product_hero", "product_final", "craft_macro"], ownSku: true },
  { id: "craft", label: "Chế tác", roles: ["craft", "craft_macro", "craft_pov"], ownSku: true },
  { id: "huyk", label: "HuyK", roles: ["huyk_talk", "huyk_silent"], ownSku: false },
  { id: "outro", label: "Outro", roles: ["outro"], ownSku: false },
  { id: "all", label: "Tất cả", roles: null, ownSku: false },
];

export const STEP_VI = { thiet_ke: "Thiết kế", chuan_bi_nguyen_lieu: "Nguyên liệu", nung_nau: "Nung / đánh lửa", do_khuon: "Đổ khuôn", dap_can: "Đập/cán",
  cua_cat: "Cưa cắt", han: "Hàn", dua_mai: "Giũa mài", khoan: "Khoan", gan_da_chu: "Gắn đá chủ", dinh_da: "Đính đá", danh_bong: "Đánh bóng",
  hoan_thien: "Hoàn thiện", tao_dang: "Uốn tạo dáng", lam_sach: "Làm sạch", khac_laser: "Khắc laser" };

const inStage = (clip, stage, sku) => {
  if (stage.roles && !stage.roles.some((r) => (clip.roles || []).includes(r))) return false;
  if (stage.ownSku) return clip.product_set === sku;
  if (stage.id !== "all" && clip.product_set) return false;
  return true;
};

export default function FootageTab({ boot, job }) {
  const [stageId, setStageId] = useState("product");
  const [step, setStep] = useState("");
  const sel = useEditorStore((s) => s.sel);
  const pickedSku = useEditorStore((s) => s.pickedSku);
  const actions = useStudioActions();
  const queryClient = useQueryClient();
  const steps = boot.craft_steps?.length
    ? boot.craft_steps
    : Object.entries(STEP_VI).map(([id, label]) => ({ id, label }));

  const labelClip = useMutation({
    mutationFn: ({ clipId, craft_step }) => api.labelClip(clipId, craft_step),
    onSuccess: (clip) => {
      queryClient.setQueryData(["studio", "bootstrap"], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          library: prev.library.map((c) =>
            c.id === clip.id ? { ...c, craft_step: clip.craft_step, craft_step_source: clip.craft_step_source } : c,
          ),
        };
      });
    },
    onError: (err) => alert(`Gắn nhãn: ${err.message}`),
  });

  // Bám mã đang chọn bên tab Kịch bản để xem được footage trước cả khi dựng; dựng xong
  // thì mã của job là nguồn đúng, vì lúc đó người dùng có thể đã bấm chọn mã khác.
  const sku = job?.sku || pickedSku;
  const stage = STAGES.find((s) => s.id === stageId) ?? STAGES[0];
  const clips = boot.library.filter((c) => inStage(c, stage, sku) && (!step || c.craft_step === step));
  const shot = currentShot(job, sel);
  const part = currentPart(job, sel);

  // Số clip của từng công đoạn: cho thấy ngay kho đang thiếu nhóm nào mà không phải bấm thử.
  const counts = Object.fromEntries(
    STAGES.map((s) => [s.id, boot.library.filter((c) => inStage(c, s, sku)).length]),
  );

  return (
    <>
      <div className="chips">
        {STAGES.map((s) => (
          <button
            key={s.id}
            className={`small-btn ${stageId === s.id ? "on" : ""}`}
            onClick={() => {
              setStageId(s.id);
              if (s.id !== "craft") setStep("");
            }}
          >
            {s.label} ({counts[s.id]})
          </button>
        ))}
      </div>
      {stageId === "craft" && (
        <select value={step} onChange={(e) => setStep(e.target.value)}>
          <option value="">Mọi công đoạn</option>
          {steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      )}
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
        {stage.ownSku && !sku ? "Chọn sản phẩm để xem footage đúng mã." : ""}
        {stageId === "craft"
          ? " Chọn công đoạn trên từng clip để gắn nhãn (nung/đánh lửa, cưa, hàn…) — lần dựng sau bốc đúng cảnh."
          : ""}
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
                {stageId === "craft" || stageId === "all" ? (
                  <select
                    className="step-pick"
                    value={c.craft_step || ""}
                    disabled={labelClip.isPending}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      labelClip.mutate({ clipId: c.id, craft_step: e.target.value || null });
                    }}
                  >
                    <option value="">Chưa gắn công đoạn</option>
                    {steps.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  STEP_VI[c.craft_step] || c.roles?.[0] || ""
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="hint">
            {stage.ownSku && sku
              ? `Mã ${sku} chưa có clip nhóm "${stage.label}" trên máy.`
              : "Không có clip phù hợp bộ lọc."}
          </p>
        )}
      </div>
    </>
  );
}
