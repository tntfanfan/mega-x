import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Route guard for Business / Solo / Dev / Admin workbenches.
 * Landing (`/`) and `/login` stay public.
 *
 * On block, preserve the in-app hash path for post-login return
 * (only same-app paths — open redirect safe).
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, loading, errorMessage, reload } = useAuth();
  const location = useLocation();

  if (loading || status === "loading") {
    return (
      <div className="container py-24 text-center text-muted text-sm">
        正在确认登录状态…
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="container py-24 max-w-md mx-auto text-center space-y-4">
        <h1 className="font-display text-2xl text-heading">服务暂时不可用</h1>
        <p className="text-body text-sm">{errorMessage || "请稍后重试"}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="px-4 py-2 text-sm rounded-md bg-primary text-white hover:opacity-90"
        >
          重试
        </button>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="container py-24 max-w-md mx-auto text-center space-y-4">
        <h1 className="font-display text-2xl text-heading">没有访问权限</h1>
        <p className="text-body text-sm">当前账号无法访问此页面。</p>
      </div>
    );
  }

  if (status !== "authenticated") {
    const next = `${location.pathname}${location.search}${location.hash}`;
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return <Navigate to={`/login?next=${encodeURIComponent(safeNext)}`} replace />;
  }

  return <>{children}</>;
}
