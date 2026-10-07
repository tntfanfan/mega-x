import test from "node:test";
import assert from "node:assert/strict";
import {
  selectParticipants,
  dialogueDraftKey,
  dialogueCanSend,
  conversationRequest,
  dialogueError,
  turnStates,
} from "../src/lib/research/dialogue.ts";
const personas = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
  { id: "e" },
];
test("roundtable accepts two through four, uses catalog order and persisted members are immutable", () => {
  assert.deepEqual(selectParticipants(["c", "a"], personas, "b", true, false), [
    "a",
    "b",
    "c",
  ]);
  assert.deepEqual(
    selectParticipants(["a", "b", "c", "d"], personas, "e", true, false),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(selectParticipants(["a", "b"], personas, "b", false, true), [
    "a",
    "b",
  ]);
  const base = {
    company: "a",
    can_send: true,
    message: "q",
    kind: "roundtable",
    participants: ["a", "b"],
  };
  assert(dialogueCanSend(base));
  for (const participants of [[], ["a"], ["a", "b", "c", "d", "e"]])
    assert(!dialogueCanSend({ ...base, participants }));
});
test("drafts are scoped to company, role, roundtable and report versions", () => {
  const ctx = {
    company: "c",
    cid: "",
    persona: "a",
    kind: "single",
    participants: ["a", "b"],
    generation: 1,
  };
  assert.notEqual(
    dialogueDraftKey(ctx, null),
    dialogueDraftKey({ ...ctx, company: "other" }, null),
  );
  assert.notEqual(
    dialogueDraftKey(ctx, null),
    dialogueDraftKey({ ...ctx, persona: "b" }, null),
  );
  assert.notEqual(
    dialogueDraftKey(ctx, null),
    dialogueDraftKey({ ...ctx, kind: "roundtable" }, null),
  );
  assert.notEqual(
    dialogueDraftKey(ctx, null),
    dialogueDraftKey(ctx, { task_id: "t", run_id: "r1" }),
  );
});
test("report conversation strips stale hash metadata and roundtables use ordered persona IDs", () => {
  const report = {
    task_id: "t-12345678",
    run_id: "r-20261003-1234567890abcdef",
    report_sha256: "x",
  };
  assert.deepEqual(
    conversationRequest(
      { kind: "single", persona: "buffett", participants: [] },
      report,
    ),
    {
      persona_id: "buffett",
      report: { task_id: report.task_id, run_id: report.run_id },
    },
  );
  assert.deepEqual(
    conversationRequest(
      {
        kind: "roundtable",
        persona: "buffett",
        participants: ["buffett", "munger"],
      },
      null,
    ),
    { persona_ids: ["buffett", "munger"], report: null },
  );
});
test("source generation errors and every speech state keep their recovery explanation", () => {
  assert.match(dialogueError("generation_timeout"), /问题已保存/);
  assert.match(dialogueError("report_unavailable"), /重新选择报告/);
  assert.equal(turnStates.partial, "部分完成");
  assert.equal(turnStates.interrupted, "生成已中断");
});
