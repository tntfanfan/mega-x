import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../lib/api";

type ListingItem = {
  dept_id: string;
  version?: string;
  name?: string;
  emoji?: string;
  mission?: string;
  author_user_id?: string;
  published_at?: string;
  listing_status: string;
  listing_reviewed_at?: string | null;
  listing_reviewed_by?: string | null;
  listing_note?: string;
};

type ListingsResponse = {
  items: ListingItem[];
  status: string;
  count: number;
};

type Tab = "pending_review" | "approved" | "rejected";

export default function AdminReviewQueue() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("pending_review");
  const [items, setItems] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ListingsResponse>(
        `/v1/admin/listings?status=${encodeURIComponent(tab)}`,
      );
      setItems(res.items || []);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message || t("admin.review-queue.load-failed")
          : t("admin.review-queue.load-failed");
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (deptId: string) => {
    setBusyId(deptId);
    setError(null);
    try {
      await api.post(`/v1/admin/listings/${encodeURIComponent(deptId)}/approve`);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message || t("admin.review-queue.action-failed")
          : t("admin.review-queue.action-failed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (deptId: string) => {
    const note = window.prompt(t("admin.review-queue.reject-prompt")) ?? "";
    setBusyId(deptId);
    setError(null);
    try {
      await api.post(`/v1/admin/listings/${encodeURIComponent(deptId)}/reject`, {
        note,
      });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message || t("admin.review-queue.action-failed")
          : t("admin.review-queue.action-failed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "pending_review", label: t("admin.review-queue.tab.pending") },
    { id: "approved", label: t("admin.review-queue.tab.approved") },
    { id: "rejected", label: t("admin.review-queue.tab.rejected") },
  ];

  return (
    <section className="container py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl text-heading">
          {t("admin.review-queue.title")}
        </h1>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          {t("admin.review-queue.subtitle")}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={`rounded-md px-3 py-1.5 text-sm border transition ${
              tab === tabItem.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border-solid text-body hover:border-primary/40"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-fusion/40 bg-fusion/10 px-4 py-3 text-sm text-fusion">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t("admin.review-queue.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{t("admin.review-queue.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const busy = busyId === item.dept_id;
            return (
              <li
                key={`${item.dept_id}-${item.version}`}
                className="rounded-md border border-border-solid bg-surface px-4 py-4 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span aria-hidden>{item.emoji || "🆕"}</span>
                    <span className="font-medium text-heading truncate">
                      {item.name || item.dept_id}
                    </span>
                    <span className="text-xs text-muted font-mono">
                      {item.version || "v?"}
                    </span>
                  </div>
                  {item.mission && (
                    <p className="text-sm text-body line-clamp-2">{item.mission}</p>
                  )}
                  <p className="text-xs text-muted">
                    {t("admin.review-queue.meta", {
                      author: item.author_user_id || "—",
                      at: item.published_at || "—",
                      id: item.dept_id,
                    })}
                  </p>
                  {item.listing_note && (
                    <p className="text-xs text-muted">
                      {t("admin.review-queue.note", { note: item.listing_note })}
                    </p>
                  )}
                </div>
                {tab === "pending_review" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approve(item.dept_id)}
                      className="rounded-md bg-primary text-bg px-3 py-1.5 text-sm font-medium hover:bg-accent transition disabled:opacity-50"
                    >
                      {busy ? "…" : t("admin.review-queue.approve")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reject(item.dept_id)}
                      className="rounded-md border border-border-solid px-3 py-1.5 text-sm text-body hover:border-fusion/50 hover:text-fusion transition disabled:opacity-50"
                    >
                      {t("admin.review-queue.reject")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
