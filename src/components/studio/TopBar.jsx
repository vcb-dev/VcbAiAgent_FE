// Top bar: brand, page tabs, project title, environment chip, current user and the export dropdown.
import { useCurrentUser, useLogout } from "@/features/auth/useAuth";
import ExportMenu from "./ExportMenu";

export default function TopBar({ boot, job, tab, onTab }) {
  const sample = boot && job ? boot.samples.find((x) => x.script === job.script) : null;
  const { data: user } = useCurrentUser();
  const { mutate: logout, isPending: loggingOut } = useLogout();

  const onLogout = () => logout(undefined, { onSettled: () => window.location.assign("/login") });

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">V</span>VCB Video Agent
      </div>
      <nav className="tabs">
        <button className={`tab${tab === "studio" ? " active" : ""}`} onClick={() => onTab("studio")}>
          Studio dựng video
        </button>
        <button className={`tab${tab === "models" ? " active" : ""}`} onClick={() => onTab("models")}>
          So sánh model AI
        </button>
      </nav>
      <div className="project-title">
        {job ? (
          <>
            <b style={{ color: "var(--ink)" }}>{sample?.title || "Kịch bản tự nhập"}</b> ·{" "}
            {job.product_name || "không gắn SKU"}
          </>
        ) : (
          "Dự án mới"
        )}
      </div>
      <div className={boot ? `chip ${boot.eleven_available ? "ok" : "warn"}` : "chip"}>
        {boot
          ? `${boot.clip_count} clip · giọng: ${boot.eleven_available ? "HuyK (ElevenLabs v4)" : "demo"} · planner: ${boot.claude_available ? "Claude" : "offline"}`
          : "…"}
      </div>
      <ExportMenu job={job} />
      <button className="chip auth-chip" onClick={onLogout} disabled={loggingOut} title={user?.email || ""}>
        {user?.fullName || user?.email || "Tài khoản"} · Thoát
      </button>
    </header>
  );
}
