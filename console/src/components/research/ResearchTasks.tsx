import { useState } from "react";
import type { ResearchState } from "../../hooks/useResearch";
import type { ResearchClient } from "../../lib/research/client";
import type { ReportBinding, ResearchLanguage } from "../../lib/research/types";
import {
  runActions,
  stageStates,
  taskMarket,
  researchErrors,
} from "../../lib/research/core";
import { dateLabel } from "../../lib/research/copy";
import { OutputRows } from "./ResearchOutputs";
import { Badge, Section, buttonClass, inputClass, type Copy } from "./shared";
export function ResearchTasks({
  research,
  companyId,
  client,
  onPreview,
  onDiscuss,
  language,
  tr,
}: {
  research: ResearchState;
  companyId: string;
  client: ResearchClient;
  onPreview: (path: string) => void;
  onDiscuss: (report: ReportBinding) => void;
  language: ResearchLanguage;
  tr: Copy;
}) {
  const [filter, setFilter] = useState("all"),
    [market, setMarket] = useState("all");
  const tasks = research.tasks
    .filter((t) => market === "all" || taskMarket(t) === market)
    .filter(
      (t) =>
        filter === "all" ||
        (filter === "active" &&
          ["queued", "running", "pending", "paused"].includes(t.state)) ||
        (filter === "done" && ["done", "completed"].includes(t.state)) ||
        (filter === "failed" &&
          ["failed", "interrupted", "error"].includes(t.state)),
    );
  const task = research.detail,
    run = task?.run || {},
    state = run.state || task?.state,
    actions = task ? runActions(task) : [],
    stages = stageStates(run);
  const error =
    run.error == null
      ? ""
      : typeof run.error === "string"
        ? researchErrors[run.error] || run.error
        : JSON.stringify(run.error);
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
      <Section
        id="tasks"
        title={`${tr("任务记录")} · ${research.tasks.length}`}
        action={
          <div className="flex gap-2">
            <label>
              <span className="sr-only">{tr("筛选市场")}</span>
              <select
                className={inputClass}
                value={market}
                onChange={(e) => setMarket(e.target.value)}
              >
                {[
                  ["all", "全部市场"],
                  ["A", "A 股"],
                  ["US", "美股"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {tr(l)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{tr("筛选任务")}</span>
              <select
                className={inputClass}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  ["all", "全部状态"],
                  ["active", "进行中"],
                  ["done", "已完成"],
                  ["failed", "失败 / 中断"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {tr(l)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        <div className="research-task-list divide-y divide-border-solid">
          {tasks.length ? (
            tasks.map((t) => (
              <button
                className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-start hover:bg-surface-2 ${research.selected === t.id ? "bg-surface-2" : ""}`}
                key={t.id}
                aria-pressed={research.selected === t.id}
                onClick={() => void research.selectTask(t.id)}
              >
                <div className="min-w-0">
                  <p className="text-sm text-heading break-words">
                    {t.title || t.id}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {tr(taskMarket(t) === "US" ? "美股" : "A 股")} ·{" "}
                    {dateLabel(t.created_at, language)}
                  </p>
                </div>
                <Badge state={t.state} tr={tr} />
              </button>
            ))
          ) : (
            <p className="p-5 text-sm text-muted">
              {tr("暂无符合条件的任务。提交研究后可在此查看。")}
            </p>
          )}
        </div>
      </Section>
      <Section
        title={tr("执行详情")}
        action={task && <Badge state={state} tr={tr} />}
      >
        {!task ? (
          <p className="p-5 text-sm text-muted">
            {tr(
              research.selected
                ? "正在读取…"
                : "选择一项任务，查看执行阶段和报告。",
            )}
          </p>
        ) : (
          <>
            <div className="p-5">
              <h3 className="text-lg text-heading">{task.title || task.id}</h3>
              <p className="mt-2 text-xs text-muted font-mono break-all">
                {task.id}
              </p>
              <p className="mt-3 text-xs text-muted">
                {tr("开始：")}
                {dateLabel(run.started_at, language)}
                <br />
                {tr("结束：")}
                {dateLabel(run.ended_at, language)}
              </p>
              {task.executor === "research" && (
                <ol className="mt-5 grid grid-cols-3 gap-2">
                  {["采集数据", "计算分析", "生成报告"].map((label, i) => (
                    <li
                      key={label}
                      className={`rounded-md border px-2 py-3 text-sm ${stages[i] === "complete" ? "border-spark-mint/30 text-spark-mint" : stages[i] === "current" ? "border-primary/50 text-primary" : "border-border-solid text-muted"}`}
                    >
                      {tr(label)}
                      <small className="mt-1 block">
                        {tr(
                          stages[i] === "complete"
                            ? "已完成"
                            : stages[i] === "current"
                              ? state === "failed"
                                ? "阶段失败"
                                : state === "paused"
                                  ? "已暂停"
                                  : "已开始"
                              : "未开始",
                        )}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
              {error && (
                <p className="mt-4 text-sm text-fusion" role="alert">
                  {tr(error)}
                </p>
              )}
              {run.result?.quality && (
                <p className="mt-4 text-sm text-body">
                  {tr("报告覆盖：")}
                  {tr(
                    run.result.quality === "partial" ? "部分数据缺失" : "完整",
                  )}
                  {run.result.gaps?.length
                    ? ` / ${run.result.gaps.join("、")}`
                    : ""}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action}
                    className={buttonClass}
                    disabled={research.busy}
                    onClick={() => {
                      if (action === "discuss")
                        onDiscuss({ task_id: task.id, run_id: run.id });
                      else void research[action]();
                    }}
                  >
                    {tr(
                      {
                        retry: "重新研究",
                        resume: "继续研究",
                        cancel: "取消任务",
                        discuss: "与角色讨论",
                      }[action],
                    )}
                  </button>
                ))}
              </div>
            </div>
            <OutputRows
              files={research.detailFiles}
              {...{ companyId, client, onPreview, tr }}
            />
          </>
        )}
      </Section>
    </div>
  );
}
