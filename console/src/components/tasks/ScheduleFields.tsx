import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../../lib/api";
import { formatTaskTime, scheduleExecutionPolicy, type Schedule } from "../../lib/tasks";

const field = "mt-1 w-full min-w-0 rounded border border-border-solid bg-surface px-3 py-2 text-sm text-body focus:border-primary";
const frequencies = [["daily", "每天"], ["weekdays", "周一至周五"], ["weekly", "每周"], ["monthly", "每月"], ["interval", "每隔一段时间"], ["at", "只执行一次"], ["cron", "高级 cron"]];

function wallTime(instant: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function zonedInstant(value: string, tz: string): string {
  const requested = Date.parse(`${value}:00Z`);
  let candidate = requested;
  for (let i = 0; i < 4; i++) {
    const displayed = Date.parse(`${wallTime(new Date(candidate).toISOString(), tz)}:00Z`);
    if (displayed === requested) return new Date(candidate).toISOString();
    candidate += requested - displayed;
  }
  throw new Error("所选时区不存在这个日期或时间，请调整");
}

export function ScheduleFields({ base, value, onChange, onValidity }: { base: string; value: Schedule; onChange: (s: Schedule) => void; onValidity?: (valid: boolean) => void }) {
  const [times, setTimes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const frequency = value.type === "at" || value.type === "interval" ? value.type : value.preset?.type || "cron";
  const patch = (data: Partial<Schedule>) => onChange({ ...value, ...data, ...scheduleExecutionPolicy });
  const preset = (data: Partial<NonNullable<Schedule["preset"]>>) => patch({ preset: { ...value.preset, ...data }, cron: "" });
  const choose = (type: string) => onChange({ type: type === "at" || type === "interval" ? type : "cron", tz: value.tz || "Asia/Shanghai", cron: type === "cron" ? "0 8 * * *" : "", preset: type === "cron" || type === "at" || type === "interval" ? undefined : { type, time: "08:00", days: [1], day: 1 }, interval_seconds: 3600, anchor_at: new Date(Date.now() + 15 * 60000).toISOString(), ...scheduleExecutionPolicy });
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    onValidity?.(false);
    setLoading(true); setError(""); setTimes([]);
    const timer = setTimeout(() => {
      api.post<{ times: string[] }>(`${base}/tasks/schedule/preview`, { ...value, ...scheduleExecutionPolicy }, { signal: controller.signal }).then((result) => {
        if (cancelled) return;
        setTimes(result.times); setError(result.times.length ? "" : "没有未来执行时间，请调整日期"); onValidity?.(result.times.length > 0);
      }).catch((e) => { if (!cancelled) { setError(apiErrorMessage(e, "周期设置无效")); setTimes([]); } }).finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [base, JSON.stringify(value), retry]);
  const localInput = (iso: string | null | undefined) => {
    if (!iso) return "";
    try { return wallTime(iso, value.tz || "Asia/Shanghai"); } catch { return ""; }
  };
  const setDate = (key: "at" | "anchor_at", date: string) => {
    try { patch({ [key]: date ? zonedInstant(date, value.tz || "Asia/Shanghai") : null }); }
    catch (e) { setError(apiErrorMessage(e, "日期或时区无效")); onValidity?.(false); }
  };
  return <section className="min-w-0 space-y-3" aria-label="周期设置">
    <label className="block text-sm text-muted">频率<select aria-label="执行频率" value={frequency} onChange={e => choose(e.target.value)} className={field}>{frequencies.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
      {!["at", "interval", "cron"].includes(frequency) && <label className="text-sm text-body">执行时间<input type="time" required value={value.preset?.time || "08:00"} onChange={e => preset({ time: e.target.value })} className={field} /></label>}
      {frequency === "monthly" && <label className="text-sm text-body">每月日期<input type="number" min={1} max={31} required value={value.preset?.day || 1} onChange={e => preset({ day: Number(e.target.value) })} className={field} /><span className="text-xs text-muted">没有这个日期的月份将跳过</span></label>}
      {frequency === "interval" && <><label className="text-sm text-body">间隔（分钟，至少 15）<input type="number" min={15} required value={(value.interval_seconds || 900) / 60} onChange={e => patch({ interval_seconds: Number(e.target.value) * 60 })} className={field} /></label><label className="text-sm text-body">首次执行<input type="datetime-local" required value={localInput(value.anchor_at)} onChange={e => setDate("anchor_at", e.target.value)} className={field} /></label></>}
      {frequency === "at" && <label className="text-sm text-body">执行日期与时间<input type="datetime-local" required value={localInput(value.at)} onChange={e => setDate("at", e.target.value)} className={field} /></label>}
      {frequency === "cron" && <label className="text-sm text-body">五段 cron<input required placeholder="0 8 * * *" value={value.cron || ""} onChange={e => patch({ cron: e.target.value })} className={`${field} font-mono`} /></label>}
    </div>
    {frequency === "weekly" && <fieldset><legend className="mb-2 text-sm text-body">选择星期</legend><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 0].map(d => <label key={d} className="flex min-h-10 items-center gap-2 rounded border border-border-solid px-3 text-sm"><input type="checkbox" checked={value.preset?.days?.includes(d) || false} onChange={e => preset({ days: e.target.checked ? [...(value.preset?.days || []), d] : (value.preset?.days || []).filter(day => day !== d) })} />周{["日", "一", "二", "三", "四", "五", "六"][d]}</label>)}</div></fieldset>}
    <div className="text-xs text-muted" aria-live="polite">{loading ? <span className="animate-pulse">计算中…</span> : error ? <><p role="alert" className="text-fusion">{error}</p><button type="button" onClick={() => setRetry(current => current + 1)} className="min-h-8 text-primary">重试</button></> : <p>下次 {formatTaskTime(times[0], value.tz)} · {value.tz === "Asia/Shanghai" ? "北京时间" : value.tz}</p>}</div>
    <details className="text-xs text-muted"><summary className="min-h-8 cursor-pointer">更多设置</summary><label className="block">时区<input required value={value.tz || "Asia/Shanghai"} onChange={e => patch({ tz: e.target.value })} className={field} /></label><ol className="mt-3 space-y-1">{times.slice(0, 3).map(time => <li key={time}>{formatTaskTime(time, value.tz)}</li>)}</ol></details>
  </section>;
}

export const defaultSchedule: Schedule = { type: "cron", preset: { type: "daily", time: "08:00" }, tz: "Asia/Shanghai", ...scheduleExecutionPolicy };
