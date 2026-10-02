import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/tasks.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const context = vm.createContext({ exports: {}, Intl, Date });
vm.runInContext(compiled, context);
const { taskStatusLabel, taskScheduleLabel, taskListState } = context.exports;
const schedule = { mode: "scheduled", enabled: true, type: "cron", preset: { type: "daily", time: "08:00" }, tz: "Asia/Shanghai", next_run_at: "2026-10-03T00:00:00Z" };
const task = (extra = {}) => ({ id: "t-status", title: "日报", state: "ready", preparation_state: "ready", schedule, ...extra });

test("an enabled timer is idle until a run starts and shows the next time in its timezone", () => {
  assert.equal(taskStatusLabel(task()), "等待定时执行");
  assert.equal(taskListState(task()), "pending");
  assert.match(taskScheduleLabel(task()), /^每天 08:00 · 下次执行：10月3日.*08:00$/);
  const finished = task({ last_run: { state: "done" } });
  assert.equal(taskStatusLabel(finished), "等待下轮执行");
  assert.equal(taskListState(finished), "done");
});

test("current execution and preparation take precedence over an enabled timer", () => {
  for (const [state, label] of [["queued", "排队中"], ["running", "正在执行"], ["verifying", "正在验收"], ["waiting_input", "等待补充信息"], ["failed", "执行遇到问题"]]) {
    assert.equal(taskStatusLabel(task({ last_run: { state: "done" }, current_run: { state } })), label);
  }
  assert.equal(taskStatusLabel(task({ preparation_state: "plan_review", last_run: { state: "done" } })), "计划待确认");
});

test("paused, exhausted and blocked timers do not advertise a stale next time", () => {
  const paused = task({ schedule: { ...schedule, enabled: false } });
  assert.equal(taskScheduleLabel(paused), "每天 08:00 · 定时已暂停");
  assert.equal(taskStatusLabel(paused), "已就绪");
  assert.match(taskScheduleLabel(task({ schedule: { ...schedule, enabled: false, block_reason: "consecutive_failures" } })), /定时已暂停 · 连续失败 3 次$/);
  assert.match(taskScheduleLabel(task({ schedule: { ...schedule, enabled: false, last_fired_at: schedule.next_run_at, next_run_at: null } })), /定时已结束$/);
  assert.match(taskScheduleLabel(task({ schedule: { ...schedule, next_run_at: null } })), /下次执行：待更新$/);
});

test("immediate and archived tasks retain their actual status", () => {
  assert.equal(taskScheduleLabel(task({ schedule: { mode: "immediate", enabled: false } })), null);
  assert.equal(taskStatusLabel(task({ schedule: null, last_run: { state: "failed" } })), "执行遇到问题");
  assert.equal(taskStatusLabel(task({ state: "archived", preparation_state: "archived", last_run: { state: "done" } })), "已归档");
  assert.match(taskScheduleLabel(task({ schedule: { ...schedule, mode: undefined } })), /下次执行/);
});
