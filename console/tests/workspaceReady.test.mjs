import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup() {
  const timers = new Map();
  let timerId = 0;
  const sockets = [];
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    sent = [];
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const source = readFileSync(new URL("../src/lib/tryChatWs.ts", import.meta.url), "utf8").replaceAll("import.meta.env", "({})");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, WebSocket: Socket, URL, Date,
    location: { protocol: "https:", host: "mega-x.ai" },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    require: () => ({ normalizeRefs: refs => refs || [], refsForApi: refs => refs, messageId: () => "message-1" }),
  });
  vm.runInContext(compiled, context);
  let availability = false;
  const client = new context.exports.TryChatWs("/v1/companies/c-test/chat/ws", {
    onReady: () => { availability = true; },
    onClose: () => { availability = false; },
    onError: () => { if (!client.ready) availability = false; },
  });
  client.connect();
  const socket = sockets[0];
  socket.open();
  return { client, socket, sockets, timers, available: () => availability,
    tick: delay => { const [id, timer] = [...timers].find(([, value]) => value.delay === delay) || []; assert.ok(timer); timers.delete(id); timer.fn(); } };
}

test("an open browser socket stays disabled until the gateway confirms ready", () => {
  const s = setup();
  assert.equal(s.client.ready, false);
  assert.equal(s.client.sendPrompt("hello"), false);
  s.socket.receive({ type: "ready", capabilities: { output_refs: true } });
  assert.equal(s.available(), true);
  assert.equal(s.client.sendPrompt("hello"), true);
  s.client.close();
  assert.equal(s.timers.size, 0);
});

test("gateway failure disables the workspace immediately and reconnects", () => {
  const s = setup();
  s.socket.receive({ type: "ready" });
  s.socket.receive({ type: "error", code: "gateway_unavailable", message: "gateway unreachable" });
  assert.equal(s.available(), false);
  assert.equal(s.client.sendPrompt("hello"), false);
  s.tick(4000);
  assert.equal(s.sockets.length, 2);
  assert.equal(s.client.ready, false);
  s.client.close();
});

test("an unresponsive connection disables the workspace and clears heartbeat timers", () => {
  const s = setup();
  s.socket.receive({ type: "ready" });
  s.tick(10000);
  assert.equal(s.socket.sent[0].type, "ping");
  s.tick(8000);
  assert.equal(s.available(), false);
  s.client.close();
  assert.equal(s.timers.size, 0);
});
