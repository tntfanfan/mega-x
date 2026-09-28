import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { api, apiErrorMessage } from "../../../lib/api";
import type { Company, DeptCatalogItem } from "../../../lib/api";
import { companyScope } from "../../../lib/workspaceScope";

type Ctx = { company: Company };

const OUTPUTS = ["markdown", "pptx", "html", "xlsx", "image", "csv", "pdf"];

export default function TaskNew() {
  const { company } = useOutletContext<Ctx>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const scope = companyScope(company.id);
  const initialKind = params.get("kind") === "scheduled" ? "scheduled" : "long";
  const [kind, setKind] = useState<"long" | "scheduled">(initialKind);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [lead, setLead] = useState(params.get("dept") || "");
  const [depts, setDepts] = useState<DeptCatalogItem[]>([]);
  const [outputs, setOutputs] = useState<string[]>(["markdown"]);
  const [preset, setPreset] = useState("weekdays");
  const [time, setTime] = useState("08:00");
  const [cron, setCron] = useState("0 8 * * 1-5");
  const [preview, setPreview] = useState<string[]>([]);
  const [skip, setSkip] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("lgh.taskDraft");
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as { goal?: string; deptId?: string };
      if (draft.goal && !goal) setGoal(draft.goal);
      if (draft.deptId && !lead) setLead(draft.deptId);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    api.get<{ items: DeptCatalogItem[] }>(`/v1/companies/${company.id}/depts`)
      .then((res) => {
        const items = res.items || [];
        setDepts(items);
        if (!lead && items[0]) setLead(items[0].id);
      })
      .catch(() => {});
  }, [company.id]);

  useEffect(() => {
    if (kind !== "scheduled") return;
    const handle = window.setTimeout(() => {
      api.post<{ times: string[] }>(`${scope.base}/tasks/schedule/preview`, { cron, tz: "Asia/Shanghai" })
        .then((res) => setPreview(res.times || []))
        .catch(() => setPreview([]));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [cron, kind, scope.base]);

  function syncCron(nextPreset: string, nextTime: string) {
    const [hh, mm] = nextTime.split(":");
    const map: Record<string, string> = {
      daily: `${mm} ${hh} * * *`,
      weekdays: `${mm} ${hh} * * 1-5`,
      weekly: `${mm} ${hh} * * 1`,
      monthly: `${mm} ${hh} 1 * *`,
    };
    if (map[nextPreset]) setCron(map[nextPreset]);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        kind,
        title: title || goal.slice(0, 24) || "未命名任务",
        goal,
        lead_dept_id: lead,
        participant_dept_ids: depts.map((d) => d.id),
        expected_outputs: outputs,
        skip_clarify: kind === "long" ? skip : false,
        clarify_first: kind === "scheduled" ? skip : false,
      };
      if (kind === "scheduled") {
        body.schedule = { cron, tz: "Asia/Shanghai", preset: { type: preset, time }, overlap: "skip" };
      }
      const task = await api.post<{ id: string }>(`${scope.base}/tasks`, body);
      sessionStorage.removeItem("lgh.taskDraft");
      navigate(`${scope.routeBase}/tasks?kind=${kind}&task=${task.id}`);
    } catch (e) {
      setError(apiErrorMessage(e, "创建失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="font-display text-lg text-heading">新建任务</h1>
      <div className="flex gap-2 text-sm">
        <button type="button" className={kind === "long" ? "text-primary" : "text-muted"} onClick={() => setKind("long")}>长程：先澄清再分步执行</button>
        <button type="button" className={kind === "scheduled" ? "text-primary" : "text-muted"} onClick={() => setKind("scheduled")}>定时：到点自动跑</button>
      </div>
      <label className="block text-sm">标题
        <input className="mt-1 w-full bg-surface border border-border-solid rounded px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block text-sm">目标
        <textarea className="mt-1 w-full bg-surface border border-border-solid rounded px-2 py-1" rows={4} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <label className="block text-sm">主部门
        <select className="mt-1 w-full bg-surface border border-border-solid rounded px-2 py-1" value={lead} onChange={(e) => setLead(e.target.value)}>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2 text-xs">
        {OUTPUTS.map((item) => (
          <label key={item} className="flex items-center gap-1">
            <input type="checkbox" checked={outputs.includes(item)} onChange={() => setOutputs(outputs.includes(item) ? outputs.filter((x) => x !== item) : [...outputs, item])} />
            {item}
          </label>
        ))}
      </div>
      {kind === "scheduled" && (
        <div className="space-y-2 text-sm">
          <label>周期
            <select className="ms-2 bg-surface border border-border-solid rounded px-2 py-1" value={preset} onChange={(e) => { setPreset(e.target.value); syncCron(e.target.value, time); }}>
              <option value="daily">每天</option>
              <option value="weekdays">工作日</option>
              <option value="weekly">每周一</option>
              <option value="monthly">每月 1 日</option>
              <option value="cron">高级 cron</option>
            </select>
            <input type="time" className="ms-2 bg-surface border border-border-solid rounded px-2 py-1" value={time} onChange={(e) => { setTime(e.target.value); syncCron(preset, e.target.value); }} />
          </label>
          <input className="w-full bg-surface border border-border-solid rounded px-2 py-1 font-mono text-xs" value={cron} onChange={(e) => { setPreset("cron"); setCron(e.target.value); }} />
          <ul className="text-xs text-muted">{preview.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
        {kind === "long" ? "跳过澄清直接规划" : "首次也澄清"}
      </label>
      {error && <p className="text-xs text-fusion">{error}</p>}
      <button type="button" disabled={busy || !goal.trim()} onClick={() => void submit()} className="rounded bg-primary text-bg px-4 py-2 text-sm disabled:opacity-50">
        {busy ? "提交中…" : "创建"}
      </button>
    </div>
  );
}
