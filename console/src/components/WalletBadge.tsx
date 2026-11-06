import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, ApiError, type Wallet } from "../lib/api";

const POLL_MS = 60_000;

/**
 * Model balance next to the user name (per-user new-api account).
 *
 * disabled → hidden; unavailable → "—"; balance <= 0 → red with a top-up hint.
 * Fetched on mount, every 60 s, and when the window regains focus.
 */
export default function WalletBadge() {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current || document.visibilityState === "hidden") return;
    inflight.current = true;
    try {
      setWallet(await api.get<Wallet>("/v1/me/wallet"));
    } catch (e) {
      // Older API without the route → hide; transient errors keep the last value.
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) setWallet(null);
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  if (!wallet || wallet.status === "disabled") return null;

  const base = "font-mono text-xs px-2 py-0.5 rounded border whitespace-nowrap";
  if (wallet.status !== "ready") {
    return (
      <span className={`${base} border-border-solid text-muted`} title={t("wallet.unavailable")}>
        —
      </span>
    );
  }
  const empty = Number(wallet.balance_cny) <= 0;
  return (
    <span
      className={
        empty
          ? `${base} border-red-400/50 bg-red-500/10 text-red-400`
          : `${base} border-border-solid text-body`
      }
      title={empty ? t("wallet.empty") : t("wallet.title", { used: wallet.used_cny })}
      aria-label={t("wallet.label", { amount: wallet.balance_cny })}
    >
      ¥{wallet.balance_cny}
    </span>
  );
}
