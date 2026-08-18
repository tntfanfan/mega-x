import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import { resolveDeptDisplay } from "../../../lib/depts";
import { useToast } from "../../../components/ui/Toast";

/** Shape of GET /v1/templates items (R1). */
interface CompanyTemplate {
  slug: string;
  emoji: string;
  name_key: string;
  desc_key: string;
  dept_ids: string[];
}

interface CreateCompanyResp {
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

export default function NewWizard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [templates, setTemplates] = useState<CompanyTemplate[]>([]);
  const [name, setName] = useState("");
  const [tplSlug, setTplSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // Keyed by slug, not a single boolean: picking a template is a comparison
  // task, so peeking at #3 must not collapse #1.
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
      .get<{ items: CompanyTemplate[] }>("/v1/templates")
      .then((r) => {
        if (cancelled) return;
        setTemplates(r.items);
        if (r.items.length > 0) setTplSlug(r.items[0].slug);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(apiErrorMessage(e, t("business.companies.new.error")));
      });
    return () => { cancelled = true; };
  }, [t]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setProgress(null);
    try {
      // dept_ids deliberately not sent: the server resolves them from the
      // template slug. Echoing our copy back let a stale bundle (or anyone
      // with curl) bypass template curation.
      const c = await api.post<CreateCompanyResp>("/v1/companies", {
        name,
        template_slug: tplSlug,
      });
      if (c.operation_id) {
        setProgress("供给中（首启可能需要数分钟）…");
        try {
          await waitForOperation(c.operation_id);
        } catch (e) {
          // Still navigate — user can watch status on company page
          toast.error(apiErrorMessage(e, "供给未完成，可稍后在公司页查看状态"));
        }
      }
      toast.success(t("business.companies.new.success", { name: name.trim() }));
      navigate(`/business/c/${c.id}/`);
    } catch (e) {
      const msg = apiErrorMessage(e, t("business.companies.new.error"));
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <section className="container py-10 max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("business.companies.new.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("business.companies.new.subtitle")}</p>
      </header>

      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{t("business.companies.new.name-label")}</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("business.companies.new.name-placeholder")}
          className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
        />
      </label>

      <div className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-2">{t("business.companies.new.template-label")}</div>
        {loadError && (
          <p className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion mb-3" role="alert">
            {loadError}
          </p>
        )}
        {/* Card = container div + two SIBLING buttons. The whole card used to be
            one <button>; nesting the expander inside it would be a <button> in a
            <button> — invalid HTML that React warns about and browsers mishandle. */}
        <div className="grid sm:grid-cols-2 gap-3">
          {templates.map((tpl) => {
            const selected = tplSlug === tpl.slug;
            const open = expanded.has(tpl.slug);
            const panelId = `tpl-depts-${tpl.slug}`;
            const nameId = `tpl-name-${tpl.slug}`;
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
                    <span className="text-xl" aria-hidden>{tpl.emoji}</span>
                    <span id={nameId} className="text-sm text-heading">{t(`business.companies.new.tpl.${tpl.slug}.name`)}</span>
                    <span className="text-[10px] text-muted ms-auto">{tpl.dept_ids.length}{t("business.overview.company.depts-suffix")}</span>
                  </div>
                  <p className="text-[11px] text-muted mt-1">{t(`business.companies.new.tpl.${tpl.slug}.desc`)}</p>
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
                        ? t("business.companies.new.tpl.depts.hide")
                        : t("business.companies.new.tpl.depts.show", { count: tpl.dept_ids.length })}
                    </button>
                    {/* Tailwind's `hidden` CLASS, not the hidden ATTRIBUTE: the UA
                        sheet's [hidden]{display:none} loses to an author
                        display:flex, so hidden={!open} would render visible.
                        Staying mounted also keeps aria-controls pointing at a
                        real element. */}
                    <ul
                      id={panelId}
                      className={`px-4 pb-4 -mt-1 flex-wrap gap-1.5 ${open ? "flex" : "hidden"}`}
                    >
                      {/* Already in canonical order from the server — do not re-sort. */}
                      {tpl.dept_ids.map((deptId) => {
                        const { emoji, name } = resolveDeptDisplay(deptId);
                        return (
                          <li
                            key={deptId}
                            className="rounded-full border border-border-solid px-2 py-0.5 text-[11px] text-body"
                          >
                            <span aria-hidden>{emoji}</span> {name}
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
        <p className="text-xs text-muted" role="status">{progress}</p>
      )}

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button onClick={() => navigate("/business/overview")} className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary">{t("common.cancel")}</button>
        <button onClick={submit} disabled={!name.trim() || !tplSlug || submitting} className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50">
          {submitting ? t("business.companies.new.submitting") : t("business.companies.new.submit")}
        </button>
      </div>
    </section>
  );
}
