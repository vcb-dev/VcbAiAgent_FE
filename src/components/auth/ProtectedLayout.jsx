import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isUnauthorized, useCurrentUser } from "@/features/auth/useAuth";

export default function ProtectedLayout() {
  const location = useLocation();
  const { isLoading, isError, error, failureReason, refetch } = useCurrentUser();

  if (isLoading) {
    return <div className="auth-splash">Đang xác thực phiên đăng nhập…</div>;
  }

  if (isError) {
    // Chỉ 401 mới đá ra login. Lỗi mạng (BE đang restart) thì cho thử lại,
    // tránh làm người dùng mất phiên vì một sự cố tạm thời.
    if (isUnauthorized(error, failureReason)) {
      return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
    }
    return (
      <div className="auth-splash">
        <div>
          <p>Không kết nối được máy chủ.</p>
          <button type="button" onClick={() => refetch()}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
