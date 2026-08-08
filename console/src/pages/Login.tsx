import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ApiError, apiErrorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";

function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    /* ignore */
  }
  return "/";
}

export default function Login() {
  const { t } = useTranslation();
  const { status, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = useMemo(() => safeNextPath(params.get("next")), [params]);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Navigate to={next} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, displayName.trim() || undefined);
      }
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError(t("auth.error.email_taken"));
        else if (err.status === 429) setError(t("auth.error.rate_limited"));
        else if (err.status === 503) setError(t("auth.error.unavailable"));
        else if (err.status === 401) setError(t("auth.error.bad_credentials"));
        else if (err.status === 403) {
          // Only map the real register gate; CSRF Origin 403 used to show this
          // same copy and looked like registration was closed.
          const detail =
            err.body && typeof err.body === "object" && "detail" in err.body
              ? String((err.body as { detail?: unknown }).detail ?? "")
              : "";
          if (
            detail.includes("registration is disabled") ||
            detail.includes("register_disabled")
          ) {
            setError(t("auth.error.register_disabled"));
          } else {
            setError(apiErrorMessage(err, t("auth.error.generic")));
          }
        } else setError(apiErrorMessage(err, t("auth.error.generic")));
      } else {
        setError(t("auth.error.generic"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="container py-16 max-w-md mx-auto">
      <div className="mb-8 space-y-2 text-center">
        <p className="text-xs tracking-[0.3em] text-primary uppercase">
          {t("auth.eyebrow")}
        </p>
        <h1 className="font-display text-3xl text-heading">
          {mode === "login" ? t("auth.login.title") : t("auth.register.title")}
        </h1>
        <p className="text-sm text-body">
          {mode === "login" ? t("auth.login.subtitle") : t("auth.register.subtitle")}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-md border border-border-solid bg-surface p-6 space-y-4"
      >
        {mode === "register" && (
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted">{t("auth.field.display_name")}</span>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
              className="w-full rounded-md border border-border-solid bg-bg px-3 py-2 text-heading"
            />
          </label>
        )}
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">{t("auth.field.email")}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border-solid bg-bg px-3 py-2 text-heading"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">{t("auth.field.password")}</span>
          <input
            type="password"
            required
            minLength={10}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border-solid bg-bg px-3 py-2 text-heading"
          />
          {mode === "register" && (
            <span className="text-xs text-muted">{t("auth.field.password_hint")}</span>
          )}
        </label>

        {error && (
          <p className="text-sm text-fusion" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary text-white py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {submitting
            ? t("auth.submitting")
            : mode === "login"
              ? t("auth.login.submit")
              : t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-body">
        {mode === "login" ? (
          <>
            {t("auth.switch.to_register")}{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              {t("auth.register.title")}
            </button>
          </>
        ) : (
          <>
            {t("auth.switch.to_login")}{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              {t("auth.login.title")}
            </button>
          </>
        )}
      </p>

      <p className="mt-4 text-center text-xs text-muted">
        <Link to="/" className="hover:text-primary">
          {t("auth.back_home")}
        </Link>
      </p>
    </section>
  );
}
