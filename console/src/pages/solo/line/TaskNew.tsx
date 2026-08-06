/**
 * /solo/l/:lineId/tasks/new — 派发新任务（与企业版同构，走 /v1/lines）。
 */

import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem, ArtifactType } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { line: Company };

const ARTIFACT_TYPES: { value: ArtifactType; emoji: string }[] = [
  { value: "markdown", emoji: "📄" },
  { value: "code", emoji: "📑" },
  { value: "image", emoji: "🖼" },
  { value: "video", emoji: "🎬" },
  { value: "audio", emoji: "🎵" },
  { value: "table", emoji: "📊" },
  { value: "json", emoji: "🔢" },
  { value: "pdf", emoji: "📕" },
];

export default function TaskNew() {
  const { line } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [deptId, setDeptId] = useState("");
  const [expected, setExpected] = useState<ArtifactType[]>(["markdown"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: DeptCatalogItem[] }>(`/v1/lines/${line.id}/depts`)
      .then((r) => {
        setDepts(r.items);
        if (r.items.length > 0) setDeptId(r.items[0].id);
      })
      .catch((e) => toast.error(apiErrorMessage(e, t("solo.line.tasks.new.depts-error"))));
  }, [line.id, toast, t]);

  const toggleArtifact = (a: ArtifactType) =>
    setExpected((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const newTask = await api.post<{ id: string }>(`/v1/lines/${line.id}/tasks`, {
        title, brief, dept_id: deptId, expected_artifacts: expected,
      });
      toast.success(t("solo.line.tasks.new.success"));
      navigate(`/solo/l/${line.id}/tasks/${newTask.id}`);
    } catch (e) {
      const msg = apiErrorMessage(e, t("solo.line.tasks.new.error"));
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <section className="p-6 max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">{t("solo.line.tasks.new.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("solo.line.tasks.new.subtitle", { line: line.name })}</p>
      </header>

      <div className="space-y-4">
        <Field label={t("solo.line.tasks.new.field.title")}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("solo.line.tasks.new.title-placeholder")}
            className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
          />
        </Field>

        <Field label={t("solo.line.tasks.new.field.brief")}>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder={t("solo.line.tasks.new.brief-placeholder")}
            className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
          />
        </Field>

        <Field label={t("solo.line.tasks.new.field.team")}>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
          >
            {depts.map((d) => (
              <option key={d.id} value={d.id}>{d.emoji} {d.name} ({d.id})</option>
            ))}
          </select>
        </Field>

        <Field label={t("solo.line.tasks.new.field.artifacts")}>
          <div className="flex flex-wrap gap-2">
            {ARTIFACT_TYPES.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => toggleArtifact(a.value)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  expected.includes(a.value)
                    ? "bg-primary text-bg border-primary"
                    : "bg-surface text-body border-border-solid hover:border-primary"
                }`}
              >
                {a.emoji} {t(`artifact.type.${a.value}`)}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {error && (
        <p className="rounded-md border border-fusion/40 bg-fusion/10 px-3 py-2 text-xs text-fusion" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button
          type="button"
          onClick={() => navigate(`/solo/l/${line.id}/tasks`)}
          className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || !deptId || submitting}
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? t("solo.line.tasks.new.submitting") : t("solo.line.tasks.new.submit")}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>
      {children}
    </label>
  );
}
