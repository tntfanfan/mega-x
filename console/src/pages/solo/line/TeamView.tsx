/**
 * /solo/l/:lineId/ (index) — Team overview.
 *
 * Shows installed AI groups + active work. Real chat lives under
 * Conversations; installing more teams is under Marketplace.
 * Remove is available here on each team card (not only in the market).
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, Task } from "../../../lib/api";
import { RoleGroupCard, type TeammateGroup } from "../../../components/solo/RoleGroupCard";
import { TeamStepCard } from "../../../components/solo/TeamStepCard";
import { useToast } from "../../../components/ui/Toast";

type Ctx = { line: Company };

export default function TeamView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const toast = useToast();
  const [groups, setGroups] = useState<TeammateGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    return Promise.all([
      api.get<{ groups: TeammateGroup[] }>(`/v1/lines/${line.id}/teammates`),
      api.get<{ items: Task[] }>(`/v1/lines/${line.id}/tasks`),
    ]).then(([gres, tres]) => {
      setGroups(gres.groups);
      setTasks(tres.items);
    });
  }, [line.id]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload, line.dept_ids.join(",")]);

  const removeTeam = async (group: TeammateGroup) => {
    const name = group.label_key ? t(group.label_key) : group.fallback_label;
    if (!window.confirm(t("solo.line.team.remove-confirm", { name }))) return;
    setRemovingId(group.dept_id);
    try {
      await api.delete(`/v1/lines/${line.id}/depts/${group.dept_id}`);
      line.dept_ids = line.dept_ids.filter((id) => id !== group.dept_id);
      setGroups((cur) => cur.filter((g) => g.dept_id !== group.dept_id));
      toast.success(t("solo.line.team.remove-success", { name }));
    } catch (e) {
      toast.error(apiErrorMessage(e, t("solo.line.team.remove-error", { name })));
    } finally {
      setRemovingId(null);
    }
  };

  const teammateCount = groups.reduce((sum, g) => sum + g.teammates.length, 0);
  const activeTasks = tasks.filter((t) => t.state === "in_progress" || t.state === "review");
  const recentDoneTasks = tasks.filter((t) => t.state === "done").slice(0, 3);

  return (
    <section className="p-6 space-y-6 max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-heading">{t("solo.line.team.title")}</h2>
          <p className="text-sm text-muted">
            {t("solo.line.team.subtitle", { count: teammateCount })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/solo/l/${line.id}/marketplace`}
            className="rounded-md border border-border-solid px-3 py-1.5 text-sm text-body hover:text-primary hover:border-primary/40 transition"
          >
            {t("solo.line.team.add-team")}
          </Link>
          <Link
            to={`/solo/l/${line.id}/conversations`}
            className="rounded-md bg-primary text-bg px-3 py-1.5 text-sm font-medium"
          >
            {t("solo.line.team.go-chat")}
          </Link>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-md border border-border-solid bg-surface/50 p-6 space-y-3">
          <p className="text-sm text-muted">{t("solo.line.team.empty")}</p>
          <Link
            to={`/solo/l/${line.id}/marketplace`}
            className="inline-block rounded-md bg-primary text-bg px-4 py-2 text-sm font-medium"
          >
            {t("solo.line.team.add-team")}
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {groups.map((g) => (
            <RoleGroupCard
              key={g.dept_id}
              group={g}
              onRemove={removeTeam}
              removing={removingId === g.dept_id}
            />
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-widest text-muted">
          {t("solo.line.team.section.work-now")}
        </h3>
        {activeTasks.length === 0 ? (
          <p className="text-sm text-muted">{t("solo.line.team.work.idle")}</p>
        ) : (
          <div className="space-y-2">
            {activeTasks.map((task) => (
              <TeamStepCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>

      {recentDoneTasks.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-muted">
            {t("solo.line.team.section.history")}
          </h3>
          <div className="space-y-2">
            {recentDoneTasks.map((task) => (
              <TeamStepCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
