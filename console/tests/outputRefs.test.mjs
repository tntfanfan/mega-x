import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const storage = new Map();
const modules = new Map();
class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static latest;
  readyState = 1;
  sent = [];
  constructor(url) { this.url = url; Socket.latest = this; }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() {}
  event(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
function lib(name) {
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8").replaceAll("import.meta.env.VITE_API_BASE", "undefined");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, require: path => lib(path.replace("./", "")), crypto: webcrypto,
    URL, Set, Map, WebSocket: Socket, location: { protocol: "https:", host: "example.test" },
    setTimeout: () => 1, clearTimeout: () => {},
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) } });
  vm.runInContext(js, context);
  modules.set(name, context.exports);
  return context.exports;
}
const refs = lib("chatRefs");
const outputs = lib("outputRefs");
const history = lib("tryChatReply");
const scopes = lib("workspaceScope");
const ref = path => outputs.outputRef({ path, name: path.split("/").pop(), kind: "markdown" });
const plain = value => JSON.parse(JSON.stringify(value));

test("output paths round-trip without truncation and deduplicate by path", () => {
  const path = `chat/dept-a/${"nested/".repeat(80)}周报 (一)#&%.md`;
  const first = ref(path);
  assert.equal(refs.mergeRefs([first], [{ ...first, id: "different", taskId: "spoofed" }]).length, 1);
  const wire = refs.refsForApi([first]);
  assert.equal(wire[0].path, path);
  assert.equal(refs.normalizeRefs(wire)[0].path, path);
  assert.equal(refs.normalizeRefs([{ type: "output", path }])[0].id, path);
  assert.equal(refs.normalizeRefs([{ type: "task", id: "t1", label: "Task" }])[0].type, "task");
});

test("a ninth reference reports overflow and keeps the existing selection", () => {
  const existing = Array.from({ length: 8 }, (_, i) => ref(`chat/file${i}.md`));
  assert.throws(() => refs.mergeRefs(existing, [ref("chat/ninth.md")]), /8/);
  let notified = false;
  assert.equal(refs.mergeRefs(existing, [ref("chat/ninth.md")], () => { notified = true; }), existing);
  assert.equal(notified, true);
});

test("workspace cache keys isolate accounts, drafts and official scope", () => {
  const personal = scopes.sandboxScope("dept-a");
  const official = scopes.sandboxScope("dept-a", true);
  const a = outputs.outputWorkspaceKey("user-a", personal);
  assert.notEqual(a, outputs.outputWorkspaceKey("user-b", personal));
  assert.notEqual(a, outputs.outputWorkspaceKey("user-a", official));
  assert.notEqual(a, outputs.outputWorkspaceKey("user-a", scopes.sandboxScope("dept-b")));
  history.saveTryChat(a, { messages: [{ id: "1", role: "user", text: "hello", refs: [ref("chat/file.md")] }] });
  assert.equal(history.loadTryChat(a).messages[0].refs[0].path, "chat/file.md");
  assert.equal(history.loadTryChat(outputs.outputWorkspaceKey("user-b", personal)), null);
});

test("history keeps same text with different files and merges by stable receipt", () => {
  const first = { id: "local-a", role: "user", text: "check", refs: [ref("chat/a.md")] };
  const second = { id: "server-b", role: "user", text: "check", refs: [ref("chat/b.md")] };
  assert.equal(history.mergeTryHistory([first], [second]).length, 2);
  assert.equal(history.mergeTryHistory([{ ...first, id: "th-0-user" }], [{ ...second, id: "th-0-user" }]).length, 2);
  const sending = { ...first, clientMessageId: "receipt-1", status: "sending" };
  const accepted = history.turnsToMessages([{ id: "try-user-receipt-1", client_message_id: "receipt-1", role: "user", text: "check", refs: refs.refsForApi(first.refs), status: "accepted" }]);
  const merged = history.mergeTryHistory([sending], accepted);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "accepted");
  assert.equal(merged[0].refs[0].path, "chat/a.md");
  const inflight = history.turnsToMessages([{ role: "user", text: "hi", client_message_id: "m1", status: "submitting" }]);
  assert.equal(inflight[0].status, "sending");
  const unknown = history.turnsToMessages([{ role: "user", text: "hi", client_message_id: "m1", status: "delivery_unknown" }]);
  assert.equal(unknown[0].status, "delivery_unknown");
});

test("acceptance consumes only the submitted draft versions", () => {
  const first = ref("chat/a.md"), second = ref("chat/b.md");
  const draft = { ...outputs.emptyOutputDraft(), text: "first", refs: [first], revision: 1, textRevision: 1,
    refRevisions: { [refs.refKey(first)]: 1 }, submission: { id: "receipt-1", textRevision: 1, refRevisions: { [refs.refKey(first)]: 1 } } };
  const next = { ...draft, text: "next", textRevision: 2, refs: [first, second], refRevisions: { ...draft.refRevisions, [refs.refKey(second)]: 2 } };
  const accepted = outputs.settleOutputDraft(next, "receipt-1", true);
  assert.equal(accepted.text, "next");
  assert.deepEqual(plain(accepted.refs), [plain(second)]);
  assert.deepEqual(plain(outputs.settleOutputDraft(draft, "receipt-1", true).refs), []);
  assert.equal(outputs.settleOutputDraft(draft, "receipt-1", true).text, "");
  const failed = outputs.settleOutputDraft(draft, "receipt-1", false);
  assert.equal(failed.text, "first");
  assert.equal(failed.refs.length, 1);
  const readded = { ...draft, refRevisions: { [refs.refKey(first)]: 3 } };
  assert.equal(outputs.settleOutputDraft(readded, "receipt-1", true).refs.length, 1);
});

test("file selection replaces the temporary reference instead of filling the reference limit", () => {
  let draft = outputs.emptyOutputDraft();
  for (let i = 0; i < 20; i++) draft = outputs.selectDraftOutput(draft, { path: `chat/file${i}.md`, name: `file${i}.md`, kind: "markdown" });
  assert.equal(draft.refs.length, 1);
  assert.equal(draft.refs[0].path, "chat/file19.md");
  assert.equal(Object.keys(draft.refRevisions).length, 1);
});

test("only explicit pins survive file changes, and unpinning releases an old selection", () => {
  const file = path => ({ path, name: path.split("/").pop(), kind: "markdown" });
  let draft = outputs.selectDraftOutput(outputs.emptyOutputDraft(), file("chat/a.md"));
  draft = outputs.toggleDraftReferencePin(draft, draft.refs[0]);
  draft = outputs.selectDraftOutput(draft, file("chat/b.md"));
  draft = outputs.toggleDraftReferencePin(draft, draft.refs[1]);
  draft = outputs.selectDraftOutput(draft, file("chat/c.md"));
  assert.deepEqual(plain(draft.refs.map(item => item.path)), ["chat/a.md", "chat/b.md", "chat/c.md"]);
  draft = outputs.toggleDraftReferencePin(draft, draft.refs[0]);
  assert.deepEqual(plain(draft.refs.map(item => item.path)), ["chat/b.md", "chat/c.md"]);
  draft = outputs.removeDraftReference(draft, draft.refs[0]);
  assert.equal(draft.pinnedRefKeys.length, 0);
  draft = outputs.toggleDraftReferencePin(draft, draft.refs[0]);
  draft = outputs.toggleDraftReferencePin(draft, draft.refs[0]);
  assert.equal(draft.refs[0].path, "chat/c.md");
  draft = outputs.selectDraftOutput(draft, file("chat/d.md"));
  assert.equal(draft.refs[0].path, "chat/d.md");
});

test("acceptance keeps pins and later file selections, while failure keeps the complete draft", () => {
  const file = path => ({ path, name: path, kind: "markdown" });
  let draft = outputs.selectDraftOutput(outputs.emptyOutputDraft(), file("chat/a.md"));
  draft = outputs.toggleDraftReferencePin(draft, draft.refs[0]);
  draft = outputs.selectDraftOutput(draft, file("chat/b.md"));
  draft = { ...draft, text: "review", textRevision: 4,
    submission: { id: "pinned-receipt", textRevision: 4, refRevisions: { ...draft.refRevisions } } };
  const accepted = outputs.settleOutputDraft(draft, "pinned-receipt", true);
  assert.deepEqual(plain(accepted.refs.map(item => item.path)), ["chat/a.md"]);
  assert.equal(accepted.text, "");
  assert.equal(accepted.selectedRefKey, undefined);
  const changed = outputs.selectDraftOutput(draft, file("chat/c.md"));
  assert.deepEqual(plain(outputs.settleOutputDraft(changed, "pinned-receipt", true).refs.map(item => item.path)), ["chat/a.md", "chat/c.md"]);
  const failed = outputs.settleOutputDraft(draft, "pinned-receipt", false);
  assert.equal(failed.text, "review");
  assert.equal(failed.refs.length, 2);
  assert.equal(failed.submission, undefined);
});

test("session selection stays within the department and caches history by session", () => {
  const first = "try-dept-a", second = `${first}-${"a".repeat(32)}`;
  assert.equal(history.selectedTrySession("dept-a", second), second);
  for (const invalid of ["try-dept-b", "../private", `${first}-unknown`, undefined]) {
    assert.equal(history.selectedTrySession("dept-a", invalid), first);
  }
  const base = outputs.outputWorkspaceKey("user-a", scopes.sandboxScope("dept-a"));
  history.saveTryChat(base, { session_id: first, messages: [{ id: "first", role: "user", text: "original" }] });
  history.saveTryChat(`${base}:session:${second}`, { session_id: second, messages: [{ id: "second", role: "user", text: "new" }] });
  assert.equal(history.loadTryChat(base).messages[0].text, "original");
  assert.equal(history.loadTryChat(`${base}:session:${second}`).messages[0].text, "new");
});

test("links decode exactly once and stay within the current workspace", () => {
  const scope = scopes.sandboxScope("dept-a"), origin = "https://example.test";
  const path = "chat/dept-a/周报 (一)#&%2e.md";
  const query = `?file=${encodeURIComponent(path)}`;
  assert.equal(outputs.outputPathFromLink(query, scope, origin), path);
  assert.equal(outputs.outputPathFromLink(`${scope.base}/outputs/raw?path=${encodeURIComponent(path)}`, scope, origin), path);
  assert.equal(outputs.outputPathFromLink(`/console${scope.routeBase}${query}`, scope, origin), path);
  assert.equal(outputs.outputPathFromLink(`https://external.test${scope.routeBase}${query}`, scope, origin), null);
  assert.equal(outputs.outputPathFromLink(`${scopes.sandboxScope("dept-b").base}/outputs/raw?path=a.md`, scope, origin), null);
  assert.equal(outputs.outputPathFromLink(`/home/openclaw/outputs/dept-b/outputs/a.md`, scope, origin), null);
});

test("mention detection supports middle insertion, paths and inline code without matching emails", () => {
  assert.deepEqual(plain(outputs.activeMention("before @周报 after", 10)), { start: 7, end: 10, query: "周报" });
  assert.equal(outputs.activeMention("name@example.com", 16), null);
  const candidates = outputs.mentionCandidates("`周报 (一)#&%.md` and chat/dept-a/weekly.md\n```txt\nhidden.md\n```\nuser@data.csv");
  assert.ok(candidates.some(item => item.value === "周报 (一)#&%.md" && item.match === "name"));
  assert.ok(candidates.some(item => item.value === "chat/dept-a/weekly.md" && item.match === "path"));
  assert.ok(!candidates.some(item => item.value === "hidden.md" || item.value === "data.csv"));
});

test("metadata can reveal a deep file even when the loaded tree omitted it", () => {
  const file = { path: "tasks/t1/runs/r1/steps/write/deep/file.md", name: "file.md", kind: "markdown" };
  const tree = outputs.treeWithOutput([{ path: "tasks", name: "tasks", label: "任务", kind: "dir" }], file);
  let leaf = tree[0];
  while (leaf.children?.length) leaf = leaf.children[0];
  assert.equal(leaf.path, file.path);
  assert.equal(outputs.treeWithOutput(tree, file).length, 1);
  assert.equal(tree[0].label, "任务");
});

test("WebSocket sends structured paths and distinguishes acceptance from unknown delivery", () => {
  const { TryChatWs } = lib("tryChatWs");
  const events = [];
  const client = new TryChatWs("/v1/dev/depts/dept-a/try_ws", { onDelivery: value => events.push(value) });
  client.connect();
  const socket = Socket.latest;
  socket.event({ type: "ready", capabilities: { output_refs: true } });
  const path = "chat/dept-a/周报 (一)#&%.md";
  assert.equal(client.sendPrompt({ text: "check", refs: [ref(path)], clientMessageId: "receipt-1" }), true);
  assert.equal(socket.sent[0].refs[0].path, path);
  assert.equal(socket.sent[0].client_message_id, "receipt-1");
  socket.event({ type: "delivery_status", client_message_id: "receipt-1", status: "delivery_unknown" });
  assert.equal(events[0].status, "delivery_unknown");
  assert.equal(socket.sent.length, 1);
  client.requestStatus("receipt-1");
  assert.equal(socket.sent[1].type, "request_status");
  socket.event({ type: "accepted", client_message_id: "receipt-1", turn_id: "try-user-receipt-1", refs: refs.refsForApi([ref(path)]) });
  assert.equal(events[1].status, "accepted");
  assert.equal(events[1].refs[0].path, path);
  client.close();
});

test("old servers preserve reference drafts and retain plain-string sends", () => {
  const { TryChatWs } = lib("tryChatWs");
  const errors = [];
  const client = new TryChatWs("/try_ws", { onError: text => errors.push(text) });
  client.connect();
  const socket = Socket.latest;
  socket.event({ type: "ready" });
  assert.equal(client.sendPrompt({ text: "check", refs: [ref("chat/a.md")], clientMessageId: "receipt-1" }), false);
  assert.equal(socket.sent.length, 0);
  assert.match(errors[0], /支持/);
  assert.equal(client.sendPrompt("legacy text"), true);
  assert.equal(socket.sent[0].message, "legacy text");
  client.close();
});

test("output file URLs use the configured API host and stay relative when it is empty", async () => {
  const source = readFileSync(new URL("../src/lib/outputs.ts", import.meta.url), "utf8");
  const scope = { base: "/v1/companies/c-1" };
  const load = (apiBase) => {
    const js = ts.transpileModule(
      source.replaceAll("import.meta.env.VITE_API_BASE", apiBase),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const posted = [];
    const context = vm.createContext({
      exports: {},
      require: () => ({ api: { post: async (_path, body) => { posted.push(body); return { url: "/v1/outputs/s/token/report.html" }; } } }),
    });
    vm.runInContext(js, context);
    return context.exports;
  };
  const remote = load(JSON.stringify("https://api.example.test/"));
  assert.equal(
    remote.rawUrl(scope, "chat/a.md", true),
    "https://api.example.test/v1/companies/c-1/outputs/raw?path=chat%2Fa.md&download=1",
  );
  assert.equal(await remote.requestPreviewUrl(scope, "chat/a.md"), "https://api.example.test/v1/outputs/s/token/report.html");
  const local = load("undefined");
  assert.equal(local.rawUrl(scope, "chat/a.md"), "/v1/companies/c-1/outputs/raw?path=chat%2Fa.md");
  const preview = readFileSync(new URL("../src/components/outputs/OutputPreview.tsx", import.meta.url), "utf8");
  assert.match(preview, /fetch\(rawUrl\(scope, file\.path\), \{ credentials: "include" \}\)/);
});

test("session queries reach both same-origin and configured WebSocket API routes", () => {
  const { TryChatWs } = lib("tryChatWs");
  const path = `/v1/dev/depts/dept-a/try_ws?session_id=try-dept-a-${"a".repeat(32)}`;
  const client = new TryChatWs(path, {});
  client.connect();
  assert.equal(Socket.latest.url, `wss://example.test${path}`);
  client.close();
  const source = readFileSync(new URL("../src/lib/tryChatWs.ts", import.meta.url), "utf8")
    .replaceAll("import.meta.env.VITE_API_BASE", JSON.stringify("https://api.example.test"));
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, require: path => lib(path.replace("./", "")), URL, WebSocket: Socket, setTimeout: () => 1, clearTimeout: () => {} });
  vm.runInContext(js, context);
  const remote = new context.exports.TryChatWs(path, {});
  remote.connect();
  assert.equal(Socket.latest.url, `wss://api.example.test${path}`);
  remote.close();
});
