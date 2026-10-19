import type { Job } from "../api";

const KIND: Record<string, string> = { image: "出图", video: "视频", cut: "成片", audio: "配音" };
const STATE: Record<string, string> = { submitted: "已提交", running: "进行中" };

/** 顶栏右侧：还没结束的作业（出图、视频）。 */
export function JobsBar({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return null;
  const byKind: Record<string, Job[]> = {};
  for (const job of jobs) (byKind[job.kind] ||= []).push(job);
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted" role="status" aria-label="作业进度">
      {Object.entries(byKind).map(([kind, list]) => {
        const running = list.filter(j => j.state === "running").length;
        return (
          <span key={kind} title={list.map(j => `${j.job_id} ${STATE[j.state] || j.state}${j.target_ref ? ` → ${j.target_ref}` : ""}`).join("\n")}
            className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-spark-blue" aria-hidden />
            作业：{KIND[kind] || kind} {list.length} 个{running ? `（${running} 个进行中）` : ""}
          </span>
        );
      })}
    </div>
  );
}
