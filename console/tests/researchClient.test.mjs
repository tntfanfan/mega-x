import test from "node:test";
import assert from "node:assert/strict";
import { createResearchClient } from "../src/lib/research/client.ts";
const calls = [];
const transport = {
  get: async (path, init) => {
    calls.push({ path, init });
    if (path.includes("/operations/")) throw Error("missing");
    return [];
  },
  post: async (path, body, init) => {
    calls.push({ path, body, init });
    return { url: "/v1/outputs/s/token" };
  },
};
const client = createResearchClient(
  transport,
  "https://api.example.com",
  "https://site.example.com",
);
test("mutations retain keys, encode identities and only send accepted report identity", async () => {
  await client.submit(
    "c/a",
    {
      market: "US",
      ticker: "AAPL",
      depth: "quick",
      school: null,
      language: "en",
    },
    "key1",
  );
  assert.equal(calls.at(-1).path, "/v1/companies/c%2Fa/research/tasks");
  assert.equal(calls.at(-1).init.headers["Idempotency-Key"], "key1");
  await client.retry("a", "t/x", "key2");
  assert(calls.at(-1).path.includes("t%2Fx"));
  assert.equal(calls.at(-1).init.headers["Idempotency-Key"], "key2");
  await client.sendTurn("a", "d/x", { message: "q", language: "zh" }, "key3");
  assert.equal(calls.at(-1).init.headers["Idempotency-Key"], "key3");
  await client.createConversation("a", {
    persona_id: "buffett",
    report: {
      task_id: "t-12345678",
      run_id: "r-20261003-1234567890abcdef",
      report_sha256: "extra",
    },
  });
  assert.deepEqual(calls.at(-1).body.report, {
    task_id: "t-12345678",
    run_id: "r-20261003-1234567890abcdef",
  });
  assert(calls.at(-1).init.signal instanceof AbortSignal);
});
test("historical missing operations are non-blocking and pagination uses offsets", async () => {
  assert.equal((await client.operation("old")).status, "unavailable");
  await client.conversations("a", 30);
  assert(calls.at(-1).path.endsWith("?offset=30"));
  await client.turns("a", "d", 50);
  assert(calls.at(-1).path.endsWith("?offset=50"));
});
test("signed preview and download respect API host and reject unrelated origins/paths/schemes", async () => {
  assert.equal(
    await client.preview("a", "file.html"),
    "https://api.example.com/v1/outputs/s/token",
  );
  const download = new URL(client.downloadUrl("a", "files/a & b.html"));
  assert.equal(download.origin, "https://api.example.com");
  assert.equal(download.searchParams.get("path"), "files/a & b.html");
  for (const url of [
    "https://evil.example.com/v1/outputs/s/x",
    "javascript:alert(1)",
    "/other/path",
    "https://api.example.com/v1/outputs/s/../raw",
  ]) {
    const c = createResearchClient(
      { ...transport, post: async () => ({ url }) },
      "https://api.example.com",
      "https://site.example.com",
    );
    await assert.rejects(() => c.preview("a", "file.html"));
  }
});
