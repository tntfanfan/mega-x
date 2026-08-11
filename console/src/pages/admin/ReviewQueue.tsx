import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../lib/api";
import { SearchInput } from "../../components/ui/SearchInput";

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
const TAB_IDS: Tab[] = ["pending_review", "approved", "rejected"];

function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactIdentity(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export default function AdminReviewQueue() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("pending_review");
  const [items, setItems] = useState<ListingItem[]>([]);
  const [counts, setCounts] = useState<Record<Tab, number>>({
    pending_review: 0,
    approved: 0,
    rejected: 0,
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const responses = await Promise.all(
        TAB_IDS.map((status) =>
          api.get<ListingsResponse>(
            `/v1/admin/listings?status=${encodeURIComponent(status)}`,
          ),
        ),
      );
      const nextCounts = Object.fromEntries(
        TAB_IDS.map((status, index) => [
          status,
          responses[index].count ?? responses[index].items?.length ?? 0,
        ]),
      ) as Record<Tab, number>;
      setCounts(nextCounts);
      setItems(responses[TAB_IDS.indexOf(tab)].items || []);
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

  const approve = async (deptId: string, name: string) => {
    if (!window.confirm(t("admin.review-queue.approve-confirm", { name }))) return;
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
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [
        item.name,
        item.dept_id,
        item.version,
        item.mission,
        item.author_user_id,
        item.listing_reviewed_by,
        item.listing_note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [items, query]);

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

      <div className="flex items-center justify-between gap-4 flex-wrap">
      <div role="tablist" aria-label={t("admin.review-queue.status-label")} className="flex gap-2 flex-wrap">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`rounded-md px-3 py-1.5 text-sm border transition ${
              tab === tabItem.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border-solid text-body hover:border-primary/40"
            }`}
          >
            {tabItem.label}
            <span className="ms-1 text-xs opacity-70">
              {counts[tabItem.id]}
            </span>
          </button>
        ))}
      </div>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t("admin.review-queue.search-placeholder")}
          className="w-72"
        />
      </div>

      {error && (
        <div className="rounded-md border border-fusion/40 bg-fusion/10 px-4 py-3 text-sm text-fusion">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">{t("admin.review-queue.loading")}</p>
      ) : filteredItems.length === 0 ? (
        <p className="text-sm text-muted">
          {query ? t("admin.review-queue.no-match") : t("admin.review-queue.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {filteredItems.map((item) => {
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
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="inline text-dim">{t("admin.review-queue.author")}: </dt>
                      <dd
                        className="inline font-mono"
                        title={item.author_user_id || undefined}
                      >
                        {compactIdentity(item.author_user_id)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-dim">{t("admin.review-queue.submitted-at")}: </dt>
                      <dd className="inline">{formatTimestamp(item.published_at, i18n.language)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-dim">{t("admin.review-queue.dept-id")}: </dt>
                      <dd className="inline font-mono">{item.dept_id}</dd>
                    </div>
                    {tab !== "pending_review" && (
                      <div>
                        <dt className="inline text-dim">{t("admin.review-queue.reviewed-by")}: </dt>
                        <dd
                          className="inline"
                          title={item.listing_reviewed_by || undefined}
                        >
                          {compactIdentity(item.listing_reviewed_by)}
                          {" · "}
                          {formatTimestamp(item.listing_reviewed_at, i18n.language)}
                        </dd>
                      </div>
                    )}
                  </dl>
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
                      onClick={() => void approve(item.dept_id, item.name || item.dept_id)}
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
