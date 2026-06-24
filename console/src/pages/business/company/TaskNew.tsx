import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { api } from "../../../lib/api";
import type { Company, DeptCatalogItem, ArtifactType } from "../../../lib/api";

type Ctx = { company: Company };

const ARTIFACT_TYPES: { value: ArtifactType; label: string; emoji: string }[] = [
  { value: "markdown", label: "Markdown 文档", emoji: "📄" },
  { value: "code", label: "代码", emoji: "📑" },
  { value: "image", label: "图片", emoji: "🖼" },
  { value: "video", label: "视频", emoji: "🎬" },
  { value: "audio", label: "音频", emoji: "🎵" },
  { value: "table", label: "表格", emoji: "📊" },
  { value: "json", label: "JSON 数据", emoji: "🔢" },
  { value: "pdf", label: "PDF", emoji: "📕" },
];

export default function TaskNew() {
  const { company } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [deptId, setDeptId] = useState("");
  const [expected, setExpected] = useState<ArtifactType[]>(["markdown"]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ items: DeptCatalogItem[] }>(`/v1/companies/${company.id}/depts`).then((r) => {
      setDepts(r.items);
      if (r.items.length > 0) setDeptId(r.items[0].id);
    });
  }, [company.id]);

  const toggleArtifact = (t: ArtifactType) =>
    setExpected((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const submit = async () => {
    setSubmitting(true);
    try {
      const newTask = await api.post<{ id: string }>(`/v1/companies/${company.id}/tasks`, {
        title, brief, dept_id: deptId, expected_artifacts: expected,
      });
      navigate(`/business/c/${company.id}/tasks/${newTask.id}`);
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  };

  return (
    <section className="p-6 max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-2xl text-heading">派发新任务</h1>
        <p className="text-sm text-muted mt-1">给「{company.name}」的某个部门下任务。</p>
      </header>

      <div className="space-y-4">
        <Field label="📝 任务标题">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="写一篇 Phyntom X8 发布博客"
            className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
          />
        </Field>

        <Field label="📋 详细描述">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="目标读者、调性、长度、参考材料、引用要求..."
            className="w-full bg-surface border border-border-solid rounded px-3 py-2 text-sm text-body focus:border-primary outline-none"
          />
        </Field>

        <Field label="🎯 派给部门">
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

        <Field label="📦 期望产物">
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
                {a.emoji} {a.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="flex gap-3 pt-4 border-t border-border-solid">
        <button
          type="button"
          onClick={() => navigate(`/business/c/${company.id}/tasks`)}
          className="rounded-md border border-border-solid px-4 py-2 text-sm text-body hover:border-primary hover:text-primary"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || !deptId || submitting}
          className="rounded-md bg-primary text-bg px-5 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "派发中..." : "派发 →"}
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
