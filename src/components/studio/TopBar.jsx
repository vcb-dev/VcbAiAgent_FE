// Sidebar: brand, page nav, project meta, export, account — dùng chung Studio / Models / Batch.
import { useCurrentUser, useLogout } from "@/features/auth/useAuth";
import ExportMenu from "./ExportMenu";

/** Giọng HuyK có sẵn chưa — bản ElevenLabs chính thức hoặc bản học từ footage xưởng. */
const voiceReady = (boot) => !!(boot.eleven_available || boot.huyk_voice_available);
const voiceName = (boot) =>
  boot.eleven_available ? "HuyK (ElevenLabs v4)" : boot.huyk_voice_available ? "HuyK" : "demo";

const NAV = [
  { id: "studio", label: "Studio dựng video" },
  { id: "models", label: "So sánh model AI" },
  { id: "batch", label: "Render hàng loạt" },
];

export default function TopBar({ boot, job, tab, onTab }) {
  const sample = boot && job ? boot.samples.find((x) => x.script === job.script) : null;
  const { data: user } = useCurrentUser();
  const { mutate: logout, isPending: loggingOut } = useLogout();

  const onLogout = () => logout(undefined, { onSettled: () => window.location.assign("/login") });

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">V</span>VCB Video Agent
      </div>
      <nav className="tabs">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`tab${tab === item.id ? " active" : ""}`}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-meta">
        <div className="project-title">
          {job ? (
            <>
              <b style={{ color: "var(--ink)" }}>{sample?.title || "Kịch bản tự nhập"}</b>
              <span> · {job.product_name || "không gắn SKU"}</span>
            </>
          ) : (
            "Dự án mới"
          )}
        </div>
        <div className={boot ? `chip ${voiceReady(boot) ? "ok" : "warn"}` : "chip"}>
          {boot
            ? `${boot.clip_count} clip · giọng: ${voiceName(boot)} · planner: ${boot.claude_available ? "Claude" : "offline"}`
            : "…"}
        </div>
      </div>
      <div className="sidebar-foot">
        <ExportMenu job={job} />
        <button className="chip auth-chip" onClick={onLogout} disabled={loggingOut} title={user?.email || ""}>
          {user?.fullName || user?.email || "Tài khoản"} · Thoát
        </button>
      </div>
    </aside>
  );
}
