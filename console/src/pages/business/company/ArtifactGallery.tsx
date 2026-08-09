/**
 * Task / owner artifact gallery.
 *
 * Used as the right pane of TasksList (filtered by selected task) and solo
 * Portfolio. Click a card to open ArtifactPreviewModal.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Artifact, ArtifactType } from "../../../lib/api";
import {
  artifactCollectionPath,
  artifactDisplayName,
  type ArtifactOwner,
} from "../../../lib/artifacts";
import { useToast } from "../../../components/ui/Toast";
import { CardGridSkeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ArtifactPreviewModal } from "../../../components/ui/ArtifactPreviewModal";

const TYPE_ICON: Record<ArtifactType, string> = {
  markdown: "📄",
  code: "📑",
  json: "📑",
  image: "🖼",
  video: "🎬",
  audio: "🎵",
  table: "📊",
  pdf: "📕",
};

function fmtSize(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function ArtifactGallery({
  owner,
  taskId,
  taskTitle,
  taskBasePath,
  emptyTitle,
  emptyHint,
  showTaskLink = false,
  pollMs,
  loadErrorKey = "business.company.outputs.load-error",
  taskLinkKey = "business.company.outputs.task-link",
}: {
  owner: ArtifactOwner;
  /** When set, only show artifacts for this task. */
  taskId?: string | null;
  /** Used to rename generic deliverable.md to a task-related label. */
  taskTitle?: string | null;
  /** Base path for task detail links, e.g. `/business/c/:id/tasks`. */
  taskBasePath?: string;
  emptyTitle?: string;
  emptyHint?: string;
  showTaskLink?: boolean;
  /** Re-fetch cadence while a live task is selected (ms). */
  pollMs?: number;
  loadErrorKey?: string;
  taskLinkKey?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Artifact[]>([]);
  const [active, setActive] = useState<Artifact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (isPoll = false) => {
      if (!isPoll) setLoading(true);
      api
        .get<{ items: Artifact[] }>(artifactCollectionPath(owner))
        .then((r) => {
          if (cancelled) return;
          setItems(r.items);
          if (pollMs && pollMs > 0) {
            timer = setTimeout(() => load(true), pollMs);
          }
        })
        .catch((e) => {
          if (cancelled || isPoll) return;
          toast.error(apiErrorMessage(e, t(loadErrorKey)));
        })
        .finally(() => {
          if (!cancelled && !isPoll) setLoading(false);
        });
    };

    load(false);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [owner.kind, owner.id, toast, t, pollMs, loadErrorKey]);

  const filtered = useMemo(() => {
    if (!taskId) return items;
    return items.filter((a) => a.task_id === taskId);
  }, [items, taskId]);

  useEffect(() => {
    if (active && !filtered.some((a) => a.id === active.id)) {
      setActive(null);
    }
  }, [filtered, active]);

  if (loading) {
    return (
      <div className="p-4">
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon="📁"
          title={emptyTitle ?? t("business.company.outputs.empty")}
          hint={emptyHint}
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setActive(a)}
            className="rounded-md border border-border-solid bg-surface p-4 text-start hover:border-primary transition-colors flex flex-col group"
          >
            <div className="text-3xl">{TYPE_ICON[a.type] ?? "📦"}</div>
            <div className="mt-2 text-sm text-heading truncate group-hover:text-primary">
              {artifactDisplayName(a, taskTitle)}
            </div>
            <div className="text-[11px] text-muted">
              {t(`artifact.type.${a.type}`, { defaultValue: a.type })} ·{" "}
              {fmtSize(a.size_bytes)}
            </div>
            <div className="mt-2 text-[11px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              {t("common.preview.open")}
            </div>
            {showTaskLink && taskBasePath && a.task_id && (
              <Link
                to={`${taskBasePath}/${a.task_id}`}
                className="mt-1 text-[11px] text-muted hover:text-primary hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {t(taskLinkKey, { id: a.task_id })}
              </Link>
            )}
          </button>
        ))}
      </div>
      {active && (
        <ArtifactPreviewModal
          art={{
            ...active,
            name: artifactDisplayName(active, taskTitle),
          }}
          owner={owner}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
