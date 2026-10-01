import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/taskCommands.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function harness(crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }) {
  const storage = new Map();
  const requests = [];
  let response = async () => ({ id: "created-task" });
  const api = Object.fromEntries(["post", "put", "patch"].map(method => [method, async (url, body, init) => {
    requests.push({ method, url, body, key: init.headers["Idempotency-Key"] });
    return response();
  }]));
  api.delete = async (url, init) => {
    requests.push({ method: "delete", url, key: init.headers["Idempotency-Key"] });
    return response();
  };
  const context = vm.createContext({
    exports: {},
    require: name => { assert.equal(name, "./api"); return { api }; },
    crypto,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  });
  vm.runInContext(compiled, context);
  return { commands: context.exports, storage, requests, respond: handler => { response = handler; } };
}

test("HTTP origins can create tasks and submit plan/schedule commands without randomUUID", async () => {
  const h = harness();
  const url = "/v1/dev/depts/dept-3rd-baowen/sandbox/tasks";
  assert.equal((await h.commands.postTaskCommand(url, { goal: "test" })).id, "created-task");
  await h.commands.putTaskCommand(`${url}/task/plan`, { version: 1 });
  await h.commands.patchTaskCommand(`${url}/task/schedule`, { enabled: true });
  assert.deepEqual(h.requests.map(request => request.method), ["post", "put", "patch"]);
  for (const request of h.requests) assert.match(request.key, /^[0-9a-f]{32}$/);
  assert.equal(new Set(h.requests.map(request => request.key)).size, 3);
  assert.equal(h.storage.size, 0);
});

test("HTTP retries reuse the receipt key; changed requests get a new key", async () => {
  const h = harness();
  const url = "/tasks";
  h.respond(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(h.commands.postTaskCommand(url, { goal: "first" }), /Failed to fetch/);
  assert.equal(h.storage.size, 1);
  await assert.rejects(h.commands.postTaskCommand(url, { goal: "first" }), /Failed to fetch/);
  assert.equal(h.requests[0].key, h.requests[1].key);
  await assert.rejects(h.commands.postTaskCommand(url, { goal: "changed" }), /Failed to fetch/);
  assert.notEqual(h.requests[1].key, h.requests[2].key);
  h.respond(async () => ({ id: "created-task" }));
  await h.commands.postTaskCommand(url, { goal: "changed" });
  assert.equal(h.requests[2].key, h.requests[3].key);
  assert.equal(h.storage.size, 0);
});

test("secure origins retain native randomUUID support", async () => {
  const h = harness(webcrypto);
  await h.commands.postTaskCommand("/tasks", { goal: "test" });
  assert.match(h.requests[0].key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("a lost deletion response can be retried with the original receipt", async () => {
  const h = harness();
  h.respond(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(h.commands.deleteTaskCommand("/tasks/t-delete"), /Failed to fetch/);
  h.respond(async () => ({ ok: true }));
  assert.equal((await h.commands.deleteTaskCommand("/tasks/t-delete")).ok, true);
  assert.equal(h.requests[0].key, h.requests[1].key);
  assert.equal(h.requests[0].method, "delete");
  assert.equal(h.storage.size, 0);
});
