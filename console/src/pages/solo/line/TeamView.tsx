/**
 * /solo/l/:lineId/ (index) — Team view（默认页）.
 *
 *   AI 团队（按组分卡）
 *   ────────────
 *   当前工作 (TeamStepCard × N)
 *   ────────────
 *   派活 ChatComposer
 */

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { api } from "../../../lib/api";
import type { Company, Task } from "../../../lib/api";
import { RoleGroupCard, type TeammateGroup } from "../../../components/solo/RoleGroupCard";
import { ChatComposer } from "../../../components/solo/ChatComposer";
import { TeamStepCard } from "../../../components/solo/TeamStepCard";

type Ctx = { line: Company };

export default function TeamView() {
  const { line } = useOutletContext<Ctx>();
  const { t } = useTranslation();
  const [groups, setGroups] = useState<TeammateGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sending, setSending] = useState(false);
  const [dispatchedMsg, setDispatchedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ groups: TeammateGroup[] }>(`/v1/lines/${line.id}/teammates`),
      api.get<{ items: Task[] }>(`/v1/lines/${line.id}/tasks`),
    ])
      .then(([gres, tres]) => {
        if (cancelled) return;
        setGroups(gres.groups);
        setTasks(tres.items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [line.id]);

  const teammateCount = groups.reduce((sum, g) => sum + g.teammates.length, 0);
  const activeTasks = tasks.filter((t) => t.state === "in_progress" || t.state === "review");
  const recentDoneTasks = tasks.filter((t) => t.state === "done").slice(0, 3);

  const send = async (text: string) => {
    setSending(true);
    setDispatchedMsg(null);
    // mock：先随便挑第一个 group / dept 当目标
    const targetDept = groups[0]?.dept_id ?? line.dept_ids[0];
    try {
      await api.post(`/v1/companies/${line.id}/tasks`, {
        title: text.slice(0, 60),
        brief: text,
        dept_id: targetDept,
        expected_artifacts: ["markdown"],
      });
      setDispatchedMsg(t("solo.line.composer.dispatched"));
      // 重新拉任务列表
      const tres = await api.get<{ items: Task[] }>(`/v1/lines/${line.id}/tasks`);
      setTasks(tres.items);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="p-6 space-y-6 max-w-5xl">
      <header>
        <h2 className="font-display text-xl text-heading">{t("solo.line.team.title")}</h2>
        <p className="text-sm text-muted">{t("solo.line.team.subtitle", { count: teammateCount })}</p>
      </header>

      {/* Groups */}
      <div className="grid sm:grid-cols-2 gap-3">
        {groups.map((g) => (
          <RoleGroupCard key={g.dept_id} group={g} />
        ))}
      </div>

      {/* Current work */}
      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-widest text-muted">{t("solo.line.team.section.work-now")}</h3>
        {activeTasks.length === 0 ? (
          <p className="text-sm text-muted">{t("solo.line.team.work.idle")}</p>
        ) : (
          <div className="space-y-2">
            {activeTasks.map((task) => <TeamStepCard key={task.id} task={task} />)}
          </div>
        )}
      </section>

      {/* Recent completed */}
      {recentDoneTasks.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-muted">{t("solo.line.team.section.history")}</h3>
          <div className="space-y-2">
            {recentDoneTasks.map((task) => <TeamStepCard key={task.id} task={task} />)}
          </div>
        </section>
      )}

      {/* Composer */}
      <section className="space-y-2 pt-4 border-t border-border-solid">
        <ChatComposer onSend={send} sending={sending} />
        {dispatchedMsg && (
          <p className="text-xs text-spark-mint">✓ {dispatchedMsg}</p>
        )}
      </section>
    </section>
  );
}
