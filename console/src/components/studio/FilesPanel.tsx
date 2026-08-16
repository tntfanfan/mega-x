import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { BuilderDraft, DraftFile } from "../../lib/builderFixtures";
import { EmptyState } from "../ui/EmptyState";

const STD_DIRS = ["agents", "config", "hooks", "mcp", "skills"] as const;
type StdDir = (typeof STD_DIRS)[number];
const DIR_ICON: Record<StdDir, string> = {
  agents: "🤖", config: "⚙️", hooks: "🪝", mcp: "🔌", skills: "🧩",
};

interface AgentGroup { slug: string; label: string; files: DraftFile[] }
interface DirSection { dir: StdDir; files: DraftFile[]; agents: AgentGroup[] }

function groupDraftFiles(draft: BuilderDraft): { lead: DraftFile[]; dirs: DirSection[] } {
  const lead: DraftFile[] = [];
  const byDir = new Map<string, DraftFile[]>(STD_DIRS.map((d) => [d, []]));
  for (const f of draft.files) {
    const top = f.name.includes("/") ? f.name.split("/")[0] : "";
    const bucket = byDir.get(top);
    if (bucket) bucket.push(f);
    else lead.push(f);
  }
  const nameBySlug = new Map(draft.agents.map((a) => [a.slug, a.display_name]));
  const dirs: DirSection[] = STD_DIRS.map((dir) => {
    const files = byDir.get(dir)!;
    if (dir !== "agents") return { dir, files, agents: [] };
    const byAgent = new Map<string, DraftFile[]>();
    for (const f of files) {
      const slug = f.name.split("/")[1] ?? "";
      if (!byAgent.has(slug)) byAgent.set(slug, []);
      byAgent.get(slug)!.push(f);
    }
    const agents: AgentGroup[] = [...byAgent.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([slug, fs]) => ({ slug, label: nameBySlug.get(slug) || slug, files: fs }));
    return { dir, files, agents };
  });
  return { lead, dirs };
}

function FileBtn({
  file, selected, indent, label, onSelect,
}: {
  file: DraftFile; selected: boolean; indent: "md" | "lg"; label: string;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(file.name)}
      title={file.name}
      className={`w-full text-start ${indent === "lg" ? "ps-9" : "ps-7"} pe-3 py-1 text-xs font-mono truncate transition-colors ${
        selected
          ? "text-primary bg-primary/10 border-e-2 border-primary"
          : "text-body hover:text-primary hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );
}

export function FileView({ file }: { file: DraftFile }) {
  const { t } = useTranslation();
  const [showDiff, setShowDiff] = useState(false);
  const diffCls = (kind: string) =>
    kind === "add" ? "text-spark-mint bg-spark-mint/10"
      : kind === "del" ? "text-fusion bg-fusion/10"
        : "text-muted";
  const prefix = (kind: string) => (kind === "add" ? "+ " : kind === "del" ? "- " : "  ");

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between border-b border-border-solid shrink-0">
        <span className="text-xs font-mono text-muted">{file.name}</span>
        {file.diff && (
          <button
            type="button"
            onClick={() => setShowDiff((d) => !d)}
            className="text-[11px] text-primary hover:underline"
          >
            {showDiff ? t("dev.studio.file.diff-off") : t("dev.studio.file.diff-on")}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {showDiff && file.diff ? (
          <pre className="font-mono text-xs leading-relaxed">
            {file.diff.map((l, i) => (
              <div key={i} className={`px-1 ${diffCls(l.kind)}`}>{prefix(l.kind)}{l.text}</div>
            ))}
          </pre>
        ) : (
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-body">{file.content}</pre>
        )}
      </div>
    </div>
  );
}

export function FilesExplorer({ draft, initialFile }: { draft: BuilderDraft; initialFile?: string }) {
  const { t } = useTranslation();
  const leadFallback = t("dev.studio.files.lead", { defaultValue: "部长（主 Agent）" });
  const { lead, dirs } = useMemo(() => groupDraftFiles(draft), [draft]);
  const [selected, setSelected] = useState<string | null>(initialFile ?? null);
  const file =
    draft.files.find((f) => f.name === selected)
    ?? draft.files.find((f) => f.name === "AGENTS.md")
    ?? draft.files[0];
  const leadAgent = draft.agents.find((a) => a.team_role === "orchestrator");

  const emptyRow = (
    <div className="ps-7 pe-3 py-1 text-xs text-dim italic">
      {t("dev.studio.files.dir-empty", { defaultValue: "（空）" })}
    </div>
  );

  return (
    <div className="h-full flex min-h-0">
      <aside className="w-48 shrink-0 border-e border-border-solid overflow-y-auto py-2">
        <div className="mb-1.5">
          <div
            className="px-3 py-1 flex items-center gap-1.5 text-[11px] text-muted uppercase tracking-wider truncate"
            title={leadAgent?.display_name || leadFallback}
          >
            <span>{draft.emoji || "👑"}</span>
            <span className="truncate">{leadAgent?.display_name || leadFallback}</span>
            <span className="text-dim">{lead.length}</span>
          </div>
          {lead.length ? lead.map((f) => (
            <FileBtn
              key={f.name} file={f} indent="md" label={f.name}
              selected={f.name === file?.name} onSelect={setSelected}
            />
          )) : emptyRow}
        </div>
        {dirs.map((sec) => (
          <div key={sec.dir} className="mb-1.5">
            <div className="px-3 py-1 flex items-center gap-1.5 text-[11px] text-muted tracking-wider truncate">
              <span>{DIR_ICON[sec.dir]}</span>
              <span className="truncate font-mono">{sec.dir}/</span>
              <span className="text-dim">{sec.files.length}</span>
            </div>
            {sec.dir === "agents" ? (
              sec.agents.length ? sec.agents.map((g) => (
                <div key={g.slug}>
                  <div className="ps-6 pe-3 py-1 flex items-center gap-1.5 text-[11px] text-muted truncate" title={g.label}>
                    <span className="truncate font-mono">{g.slug}/</span>
                    <span className="text-dim truncate">{g.label}</span>
                  </div>
                  {g.files.map((f) => (
                    <FileBtn
                      key={f.name} file={f} indent="lg"
                      label={f.name.split("/").pop() ?? f.name}
                      selected={f.name === file?.name} onSelect={setSelected}
                    />
                  ))}
                </div>
              )) : emptyRow
            ) : (
              sec.files.length ? sec.files.map((f) => (
                <FileBtn
                  key={f.name} file={f} indent="md"
                  label={f.name.slice(sec.dir.length + 1)}
                  selected={f.name === file?.name} onSelect={setSelected}
                />
              )) : emptyRow
            )}
          </div>
        ))}
      </aside>
      <div className="flex-1 min-w-0">
        {file ? (
          <FileView file={file} />
        ) : (
          <div className="p-6">
            <EmptyState icon="📄" title={t("dev.studio.files.empty", { defaultValue: "还没有文件——先和 Recruiter 聊出一版草稿" })} />
          </div>
        )}
      </div>
    </div>
  );
}

export function FilesPanel({ draft, width }: { draft: BuilderDraft; width: number }) {
  const { t } = useTranslation();
  return (
    <aside
      style={{ width }}
      className="shrink-0 border-e border-border-solid flex flex-col min-h-0 bg-surface/40"
    >
      <div className="px-4 py-2.5 border-b border-border-solid text-xs uppercase tracking-widest text-muted shrink-0">
        📄 {t("dev.studio.tab.files", { defaultValue: "文件" })}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <FilesExplorer draft={draft} />
      </div>
    </aside>
  );
}
