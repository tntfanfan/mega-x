/**
 * /solo/lines/new — New line wizard.
 *
 * Mirrors business/companies/NewWizard: load templates, wait on provision
 * operation, toast on success/failure.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import { resolveDeptDisplay } from "../../../lib/depts";
import { lookupGroupLabel } from "../../../lib/fixtures";
import { useToast } from "../../../components/ui/Toast";

interface LineTemplate {
  slug: string;
  emoji: string;
  name_key: string;
  desc_key: string;
  dept_ids: string[];
  monthly_output_estimate?: number;
  hours_saved_estimate?: number;
}

interface CreateLineResp {
  id: string;
  operation_id?: string;
  status?: string;
  state?: string;
}

async function waitForOperation(operationId: string, timeoutMs = 600_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const op = await api.get<{ status: string; error?: string }>(`/v1/operations/${operationId}`);
    if (op.status === "done") return;
    if (op.status === "failed") throw new Error(op.error || "provision failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("provision timeout");
}

export default function SoloNewWizard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [templates, setTemplates] = useState<LineTemplate[]>([]);
  const [name, setName] = useState("");
  const [tplSlug, setTplSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // Keyed by slug so comparing two lines doesn't collapse the first.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (slug: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: LineTemplate[] }>("/v1/lines/templates")
      .then((r) => {
        if (cancelled) return;
        setTemplates(r.items);
        if (r.items.length > 0) setTplSlug(r.items[0].slug);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(apiErrorMessage(e, t("solo.lines.new.error")));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const submit = async () => {
    if (!tplSlug) return;
    setSubmitting(true);
    setError(null);
    setProgress(null);
    try {
      // dept_ids deliberately not sent — the server resolves them from the
      // template slug. See business/companies/NewWizard.
      const line = await api.post<CreateLineResp>("/v1/lines", {
        name: name.trim(),
        template_slug: tplSlug,
      });
      if (line.operation_id) {
        setProgress(t("solo.lines.new.progress"));
        try {
          await waitForOperation(line.operation_id);
        } catch (e) {
          toast.error(apiErrorMessage(e, t("solo.lines.new.progress-warn")));
        }
      }
      toast.success(t("solo.lines.new.success", { name: name.trim() }));
      navigate(`/solo/l/${line.id}/`);
    } catch (e) {
      const msg = apiErrorMessage(e, t("solo.lines.new.error"));
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <section className="container py-10 max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("solo.lines.new.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("solo.lines.new.subtitle")}</p>
      </header>

      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">
          {t("solo.lines.new.name-label")}
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("solo.lines.new.name-placeholder")}
          className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
        />
      </label>

      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">
          {t("solo.lines.new.template-label")}
        </div>
        {loadError && (
          <p
            className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion mb-3"
            role="alert"
          >
            {loadError}
          </p>
        )}
        {/* Same container-div + two-sibling-buttons shape as the 2B wizard; see
            the comment there for why the card can't stay a single <button>. */}
        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map((tpl) => {
            const selected = tplSlug === tpl.slug;
            const open = expanded.has(tpl.slug);
            const panelId = `line-groups-${tpl.slug}`;
            const nameId = `line-name-${tpl.slug}`;
            return (
              <div
                key={tpl.slug}
                role="group"
                aria-labelledby={nameId}
                className={`rounded border transition-colors ${
                  selected
                    ? "bg-primary/10 border-primary"
                    : "bg-surface border-border-solid hover:border-primary"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTplSlug(tpl.slug)}
                  className="w-full text-start p-4 pb-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-t"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden>{tpl.emoji}</span>
                    <span id={nameId} className="text-sm text-heading flex-1 truncate">{t(tpl.name_key)}</span>
                    <span className="text-[10px] text-muted shrink-0">
                      {tpl.dept_ids.length}
                      {t("solo.overview.lines.teams-suffix")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-1.5 leading-relaxed">{t(tpl.desc_key)}</p>
                  {tpl.monthly_output_estimate != null && tpl.hours_saved_estimate != null && (
                    <p className="text-[10px] text-dim mt-2">
                      {t("solo.lines.new.template-meta", {
                        count: tpl.dept_ids.length,
                        output: tpl.monthly_output_estimate,
                        hours: tpl.hours_saved_estimate,
                      })}
                    </p>
                  )}
                </button>

                {tpl.dept_ids.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(tpl.slug)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="w-full flex items-center gap-1 px-4 pt-1 pb-3 text-[11px] text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                      {open
                        ? t("solo.lines.new.tpl.groups.hide")
                        : t("solo.lines.new.tpl.groups.show", { count: tpl.dept_ids.length })}
                    </button>
                    {/* `hidden` CLASS not ATTRIBUTE — see the 2B wizard's note. */}
                    <ul
                      id={panelId}
                      className={`px-4 pb-4 -mt-1 flex-wrap gap-1.5 ${open ? "flex" : "hidden"}`}
                    >
                      {/* Pipeline order, straight from the server — a 产线's dept
                          order is its workflow, so it is deliberately NOT the
                          canonical org order. Labels go through GROUP_LABELS
                          first so a super-individual sees 「内容组 / 账目组」
                          rather than 「发行部 / 财务部」. */}
                      {tpl.dept_ids.map((deptId) => {
                        const group = lookupGroupLabel(tpl.slug, deptId);
                        const fallback = resolveDeptDisplay(deptId);
                        const emoji = group?.emoji ?? fallback.emoji;
                        const label = group ? t(group.label_key) : fallback.name;
                        return (
                          <li
                            key={deptId}
                            className="rounded-full border border-border-solid px-2 py-0.5 text-[11px] text-body"
                          >
                            <span aria-hidden>{emoji}</span> {label}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion" role="alert">
          {error}
        </p>
      )}
      {progress && (
        <p className="text-xs text-muted" role="status">
          {progress}
        </p>
      )}

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button
          type="button"
          onClick={() => navigate("/solo/overview")}
          className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || !tplSlug || submitting}
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50"
        >
          {submitting ? t("solo.lines.new.submitting") : t("solo.lines.new.submit")}
        </button>
      </div>
    </section>
  );
}
