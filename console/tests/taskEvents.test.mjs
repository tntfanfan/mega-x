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
const { mergeTaskEvents } = context.exports;
const event = (seq, text, extra = {}) => ({ seq, ts: `2026-10-01T10:00:${String(seq).padStart(2, "0")}Z`, type: "progress", text, ...extra });

test("streamed summaries update in place while retaining each work step", () => {
  const rows = mergeTaskEvents(
    [event(1, "正在整理", { message_id: "clarify:one" }), event(2, "正在整理交付范围", { message_id: "clarify:one" })],
    [event(3, "搜索资料"), event(4, "已经明确三个执行步骤", { message_id: "plan:one" })],
  );
  assert.deepEqual(Array.from(rows, row => row.text), ["正在整理交付范围", "搜索资料", "已经明确三个执行步骤"]);
});

test("delayed snapshots and SSE reconnects retain the latest streamed text", () => {
  const newest = event(9, "已经明确交付范围", { message_id: "summary" });
  const rows = mergeTaskEvents([newest, event(10, "正在生成计划")], [event(7, "正在梳理", { message_id: "summary" }), newest]);
  assert.deepEqual(Array.from(rows, row => row.seq), [9, 10]);
  assert.equal(rows[0].text, "已经明确交付范围");
});
