// "Xuất" dropdown: MP4, hand-off package (MP4 + SRT + timeline.json + VO), CapCut project (planned).
import { useEffect, useState } from "react";
import { api } from "@/features/studio/api";
import { media } from "@/lib/formatHelpers";

export default function ExportMenu({ job }) {
  const [open, setOpen] = useState(false);
  const render = job?.render;
  const ready = render?.status === "done";

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="export-wrap">
      <button
        className="export-btn"
        disabled={!ready}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⤓ Xuất
      </button>
      <div className={`export-menu${open ? "" : " hidden"}`}>
        {ready && (
          <>
            <a href={media(render.url)} download>
              ⤓ Video MP4 (bản {render.revision})<small>720×1280 preview · −14 LUFS · dùng ngay khi PASS</small>
            </a>
            <a href={api.packageUrl(job.id)}>
              🗂 Gói dữ liệu cho dev<small>MP4 + phụ đề SRT + timeline.json + VO từng phần</small>
            </a>
            <div className="item disabled">
              🎬 Project CapCut (.draft)<small>Sắp có — adapter CapCut 9.3 Windows (docs 05), đội dev hoàn thiện</small>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
