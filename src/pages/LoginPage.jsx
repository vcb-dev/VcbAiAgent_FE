import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLogin } from "@/features/auth/useAuth";
import { getApiErrorMessage } from "@/lib/axios";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mutateAsync: login, isPending } = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Token do BE đặt vào cookie httpOnly; trang này không bao giờ cầm token.
  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await login({ email: email.trim(), password });
      navigate(searchParams.get("next") || "/", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Đăng nhập thất bại"));
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <span className="logo">V</span>VCB Video Agent
        </div>
        <p className="auth-sub">Đăng nhập để vào Studio dựng video</p>

        {error ? <p className="auth-error">{error}</p> : null}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="auth-field">
          <span>Mật khẩu</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button className="auth-submit" type="submit" disabled={isPending}>
          {isPending ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
