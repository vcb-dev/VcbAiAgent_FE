import { useEffect, useRef, useState } from "react";
import { api } from "../legacy/api-client.js";

const HINT = "Hỏi Agent về clip vừa sửa, công đoạn, hoặc lần dựng sau.";

export default function AgentChat({ hidden = false }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Mình học từ chỉnh sửa của bạn trong Studio. Đổi clip hay công đoạn sẽ được ghi lại cho lần dựng sau." },
  ]);
  const box = useRef(null);

  useEffect(() => {
    if (open) box.current?.scrollTo(0, box.current.scrollHeight);
  }, [open, messages, busy]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      const jobId = (typeof window !== "undefined" && window.__vcbJobId) || "";
      const res = await api.learnChat({ messages: next.slice(-12), job_id: jobId });
      setMessages([...next, { role: "assistant", content: res.reply || "…" }]);
    } catch (err) {
      setMessages([...next, { role: "assistant", content: err.message || "Không gửi được." }]);
    } finally {
      setBusy(false);
    }
  };

  if (hidden) return null;

  return (
    <div className="agent-dock">
      {open ? (
        <section className="agent-panel" aria-label="Chat Agent">
          <header className="agent-head">
            <span>Agent học dựng</span>
            <button type="button" className="agent-x" aria-label="Đóng" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="agent-msgs" ref={box}>
            {messages.map((m, i) => (
              <p key={i} className={`agent-bubble ${m.role}`}>{m.content}</p>
            ))}
            {busy ? <p className="agent-bubble assistant dim">Đang nghĩ…</p> : null}
          </div>
          <form className="agent-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={HINT}
              aria-label="Nhắn Agent"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !text.trim()}>Gửi</button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        className={`agent-fab${open ? " on" : ""}`}
        aria-label={open ? "Đóng Agent" : "Mở chat Agent"}
        title="Agent"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 10h.01M15.5 10h.01M8.5 15c1.2 1.2 5.8 1.2 7 0" />
        </svg>
      </button>
    </div>
  );
}
