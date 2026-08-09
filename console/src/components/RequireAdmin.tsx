import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import RequireAuth from "./RequireAuth";

/**
 * Admin-only gate. Must sit inside / under RequireAuth (or wrap it).
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { me, status } = useAuth();

  return (
    <RequireAuth>
      {status === "authenticated" && me && !me.roles.includes("admin") ? (
        <div className="container py-24 max-w-md mx-auto text-center space-y-4">
          <h1 className="font-display text-2xl text-heading">
            {t("admin.forbidden.title")}
          </h1>
          <p className="text-body text-sm">{t("admin.forbidden.body")}</p>
          <Link to="/" className="text-sm text-primary hover:underline">
            {t("admin.forbidden.back")}
          </Link>
        </div>
      ) : (
        <>{children}</>
      )}
    </RequireAuth>
  );
}
