import test from "node:test";
import assert from "node:assert/strict";
import {
  normalTicker,
  marketCapabilities,
  stageStates,
  requestKey,
  forgetKey,
  citationTarget,
  canSend,
  acceptsContext,
  researchExecutionReason,
} from "../src/lib/research/core.ts";
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test('company execution diagnostics are used only for execution readiness failures', () => {
  assert.equal(researchExecutionReason({reason: 'execution_not_ready'}, 'engine_missing'), 'engine_missing');
  assert.equal(researchExecutionReason({reason: 'disabled'}, 'engine_missing'), 'disabled');
  assert.equal(researchExecutionReason({reason: 'ready'}, 'engine_missing'), 'ready');
  assert.equal(researchExecutionReason({reason: 'execution_not_ready'}), 'execution_not_ready');
});
test("codes retain zeros, infer exchanges, normalize US class aliases and reject unknown codes", () => {
  for (const [a, b] of [
    ["600519", "600519.SH"],
    ["000001", "000001.SZ"],
    ["300750", "300750.SZ"],
    ["920000", "920000.BJ"],
    ["830799", "830799.BJ"],
    ["430047", "430047.BJ"],
  ])
    assert.equal(normalTicker(a), b);
  assert.equal(normalTicker(" brk.b ", "US"), "BRK-B");
  for (const a of ["900901", "60051", "123456", "600 519", "AAPL"])
    assert.throws(() => normalTicker(a));
  assert.throws(() => normalTicker("600519.SH", "US"));
});
test("stages reflect failed events rather than elapsed time", () => {
  assert.deepEqual(stageStates({ last_seq: 0 }), [
    "pending",
    "pending",
    "pending",
  ]);
  assert.deepEqual(stageStates({ last_seq: 3, state: "failed" }), [
    "complete",
    "current",
    "pending",
  ]);
  assert.deepEqual(stageStates({ last_seq: 2, stage_state: "failed" }), [
    "current",
    "pending",
    "pending",
  ]);
  assert.deepEqual(stageStates({ last_seq: 6 }), [
    "complete",
    "complete",
    "complete",
  ]);
});
test("US is quick only, legacy is A only, and executor language disables submission", () => {
  assert.deepEqual(
    Object.keys(
      marketCapabilities(
        { can_submit: true, supported_depths: ["quick"] },
        "zh",
      ),
    ),
    ["A"],
  );
  assert.equal(
    marketCapabilities({ can_submit: true }, "en").A.reason,
    "language_not_supported",
  );
  assert.equal(
    marketCapabilities(
      { can_submit: true, supported_languages: ["zh", "en"] },
      "en",
    ).A.can_submit,
    true,
  );
  assert.deepEqual(
    marketCapabilities(
      {
        markets: {
          US: { can_submit: true, supported_depths: ["quick", "standard"] },
        },
      },
      "zh",
    ).US.supported_depths,
    ["quick"],
  );
  assert.equal(
    marketCapabilities({ markets: { US: { reason: "disabled" } } }, "zh").US,
    undefined,
  );
});
test("uncertain retries retain a key; companies, market, language and payload stay isolated", () => {
  const s = memory(),
    body = { market: "A", ticker: "600519.SH", language: "zh" };
  const key = requestKey(s, "a", "submit", body);
  assert.equal(requestKey(s, "a", "submit", body), key);
  assert.notEqual(requestKey(s, "b", "submit", body), key);
  assert.notEqual(requestKey(s, "a", "submit", { ...body, market: "US" }), key);
  assert.notEqual(
    requestKey(s, "a", "submit", { ...body, language: "en" }),
    key,
  );
  forgetKey(s, "a", "submit", body);
  assert.notEqual(requestKey(s, "a", "submit", body), key);
});
test("report citations require valid identity and known evidence section", () => {
  const c = {
    report: { task_id: "t-12345678", run_id: "r-20261003-1234567890abcdef" },
    sections: [{ id: "s1" }],
  };
  assert.equal(
    citationTarget(c, "s1"),
    "tasks/t-12345678/runs/r-20261003-1234567890abcdef/final/report.html",
  );
  assert.equal(citationTarget(c, "unknown"), null);
  assert.equal(
    citationTarget({ ...c, report: { task_id: "../x", run_id: "bad" } }, "s1"),
    null,
  );
});
test("messages and late responses are bounded by their context", () => {
  assert(canSend({ company: "a", can_send: true, message: "x".repeat(4000) }));
  for (const v of [
    { message: " " },
    { message: "x".repeat(4001) },
    { busy: true },
    { generating: true },
    { can_send: false },
  ])
    assert(!canSend({ company: "a", can_send: true, message: "q", ...v }));
  const c = { company: "a", cid: "one", persona: "buffett", generation: 1 };
  assert(acceptsContext(c, { ...c }));
  for (const v of [
    { company: "b" },
    { cid: "two" },
    { persona: "lynch" },
    { generation: 2 },
  ])
    assert(!acceptsContext(c, { ...c, ...v }));
});

test("request keys work on HTTP origins without crypto.randomUUID and remain unique/retryable", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto"),
    crypto = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: (values) => crypto.getRandomValues(values) },
    });
    const s = memory(),
      first = requestKey(s, "c", "submit", { ticker: "AAPL" });
    assert.match(first, /^[a-z0-9-]+$/i);
    assert.equal(requestKey(s, "c", "submit", { ticker: "AAPL" }), first);
    assert.notEqual(requestKey(s, "c", "submit", { ticker: "MSFT" }), first);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
