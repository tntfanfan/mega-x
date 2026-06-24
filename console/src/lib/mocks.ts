/**
 * Frontend mock-mode dispatcher.
 *
 * When `import.meta.env.VITE_USE_MOCK` is truthy, `lib/api.ts` consults
 * `mockHandle()` before making any real fetch. If a handler matches the
 * (path, method) tuple, its return value is used as the response — no
 * network call leaves the browser. This is how you can develop and verify
 * the full Console UI (multi-company / canvas / tasks / artifacts) without
 * the FastAPI backend running.
 *
 * Disable: set `VITE_USE_MOCK=false` in `.env.development`, then restart
 * `npm run dev`. Same code path will make real /v1/* calls instead.
 *
 * Add a new mock: append a row to HANDLERS below. Keep the response shape
 * close to what the real FastAPI router will eventually return so swapping
 * is a one-line config change, not a refactor.
 */

import {
  COMPANIES, DEPT_CATALOG, AGENTS, TASKS, ARTIFACTS, ACTIVITY, ME,
  type Company, type Task,
} from "./fixtures";
import { BUILDER_DRAFTS, NEW_DRAFT, draftToCard } from "./builderFixtures";

const SIMULATED_LATENCY_MS = 80;

type MockResponse = { status?: number; body: unknown };
type Method = "GET" | "POST" | "PATCH" | "DELETE";

type HandlerMatch = (path: string, method: Method) => boolean | RegExpMatchArray | null;
type HandlerFn = (
  path: string,
  method: Method,
  body: unknown,
  match: RegExpMatchArray | boolean,
) => MockResponse;

interface Handler {
  match: HandlerMatch;
  handle: HandlerFn;
}

// ─── helpers ────────────────────────────────────────────────────────────

function rx(re: RegExp): HandlerMatch {
  return (p, _m) => p.match(re);
}

function exact(p: string, m: Method): HandlerMatch {
  return (path, method) => path === p && method === m;
}

function companyDeptItems(companyId: string) {
  const c = COMPANIES.find((x) => x.id === companyId);
  if (!c) return [];
  return c.dept_ids
    .map((id) => DEPT_CATALOG.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => ({
      ...d!,
      agent_count: AGENTS.filter((a) => a.company_id === companyId && a.dept_id === d!.id).length,
      active_tasks: TASKS.filter((t) => t.company_id === companyId && t.dept_id === d!.id && (t.state === "in_progress" || t.state === "review")).length,
    }));
}

// ─── dispatch table ──────────────────────────────────────────────────────

const HANDLERS: Handler[] = [
  // ── meta ──
  { match: exact("/health", "GET"), handle: () => ({ body: { status: "ok", _mock: true } }) },
  { match: exact("/v1/me", "GET"),  handle: () => ({ body: ME }) },

  // ── catalog (legacy single-tenant view, kept for back-compat) ──
  {
    match: exact("/v1/depts", "GET"),
    handle: () => ({
      body: {
        items: DEPT_CATALOG.filter((d) => d.source_type === "builtin").map((d) => ({
          id: d.id, name: d.name, source_type: d.source_type,
          role_count: d.role_count, tier_breakdown: d.tier_breakdown,
        })),
        total: DEPT_CATALOG.filter((d) => d.source_type === "builtin").length,
        _mock: true,
      },
    }),
  },

  // ── companies (multi-company) ──
  {
    match: exact("/v1/companies", "GET"),
    handle: () => ({ body: { items: COMPANIES, total: COMPANIES.length, _mock: true } }),
  },
  {
    match: exact("/v1/companies", "POST"),
    handle: (_p, _m, body) => {
      const b = (body ?? {}) as Partial<Company>;
      const newCo: Company = {
        id: `c-${Date.now().toString(36)}`,
        name: b.name ?? "新公司",
        description: b.description,
        template_slug: b.template_slug ?? "mega-x-default",
        state: "provisioning",
        gateway_port: 18800 + Math.floor(Math.random() * 100),
        dept_ids: b.dept_ids ?? ["dept-ceo", "dept-dev", "dept-pub"],
        token_usage_30d: 0,
        active_tasks: 0,
        created_at: new Date(0).toISOString(),
        emoji: b.emoji ?? "🏢",
        last_activity_at: new Date(0).toISOString(),
        last_activity_text: "实例化中…",
      };
      return { status: 201, body: newCo };
    },
  },
  {
    match: rx(/^\/v1\/companies\/([^/]+)$/),
    handle: (_p, method, body, match) => {
      const m = match as RegExpMatchArray;
      const id = m[1];
      const co = COMPANIES.find((c) => c.id === id);
      if (!co) return { status: 404, body: { error: "company not found" } };
      if (method === "GET") return { body: co };
      if (method === "PATCH") {
        // mock: just merge
        Object.assign(co, body);
        return { body: co };
      }
      if (method === "DELETE") return { body: { deleted: true } };
      return { status: 405, body: { error: "method not allowed" } };
    },
  },

  // ── company depts ──
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/depts$/),
    handle: (_p, method, body, match) => {
      const m = match as RegExpMatchArray;
      const cid = m[1];
      if (method === "POST") {
        // Install a marketplace/builtin dept into this company.
        const co = COMPANIES.find((c) => c.id === cid);
        if (!co) return { status: 404, body: { error: "company not found" } };
        const deptId = (body as { dept_id?: string } | undefined)?.dept_id;
        const dept = DEPT_CATALOG.find((d) => d.id === deptId);
        if (!deptId || !dept) return { status: 400, body: { error: "未知的部门 id" } };
        if (!co.dept_ids.includes(deptId)) co.dept_ids.push(deptId);
        return { status: 201, body: { dept_id: deptId, company_id: cid, dept_ids: co.dept_ids } };
      }
      return { body: { items: companyDeptItems(cid), _mock: true } };
    },
  },
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/depts\/([^/]+)$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const [, cid, did] = m;
      const d = DEPT_CATALOG.find((x) => x.id === did);
      if (!d) return { status: 404, body: { error: "dept not found" } };
      return {
        body: {
          ...d,
          company_id: cid,
          agents: AGENTS.filter((a) => a.company_id === cid && a.dept_id === did),
          tasks: TASKS.filter((t) => t.company_id === cid && t.dept_id === did),
        },
      };
    },
  },

  // ── company agents ──
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/depts\/([^/]+)\/agents$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const [, cid, did] = m;
      return { body: { items: AGENTS.filter((a) => a.company_id === cid && a.dept_id === did), _mock: true } };
    },
  },

  // ── company tasks ──
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/tasks$/),
    handle: (_p, method, body, match) => {
      const m = match as RegExpMatchArray;
      const cid = m[1];
      if (method === "GET") {
        return { body: { items: TASKS.filter((t) => t.company_id === cid), _mock: true } };
      }
      if (method === "POST") {
        const b = (body ?? {}) as Partial<Task>;
        const newTask: Task = {
          id: `t-${Date.now().toString(36)}`,
          company_id: cid,
          dept_id: b.dept_id ?? "dept-pub",
          title: b.title ?? "未命名任务",
          brief: b.brief ?? "",
          state: "pending",
          progress: 0,
          created_at: new Date(0).toISOString(),
          deadline: b.deadline,
          expected_artifacts: b.expected_artifacts ?? ["markdown"],
          token_used: 0,
          cost_yuan: 0,
          artifact_ids: [],
        };
        return { status: 201, body: newTask };
      }
      return { status: 405, body: { error: "method not allowed" } };
    },
  },
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/tasks\/([^/]+)$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const [, cid, tid] = m;
      const task = TASKS.find((t) => t.company_id === cid && t.id === tid);
      if (!task) return { status: 404, body: { error: "task not found" } };
      const artifacts = ARTIFACTS.filter((a) => task.artifact_ids.includes(a.id));
      return { body: { ...task, artifacts } };
    },
  },
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/tasks\/([^/]+)\/timeline$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const [, cid, tid] = m;
      return { body: { items: ACTIVITY.filter((a) => a.company_id === cid && a.task_id === tid), _mock: true } };
    },
  },

  // ── company artifacts ──
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/artifacts$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const cid = m[1];
      return { body: { items: ARTIFACTS.filter((a) => a.company_id === cid), _mock: true } };
    },
  },
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/artifacts\/([^/]+)$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const [, cid, aid] = m;
      const art = ARTIFACTS.find((a) => a.company_id === cid && a.id === aid);
      if (!art) return { status: 404, body: { error: "artifact not found" } };
      return { body: art };
    },
  },

  // ── activity stream (cross-company) ──
  {
    match: exact("/v1/activity", "GET"),
    handle: () => ({ body: { items: ACTIVITY, _mock: true } }),
  },
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/activity$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const cid = m[1];
      return { body: { items: ACTIVITY.filter((a) => a.company_id === cid), _mock: true } };
    },
  },

  // ── marketplace ──
  {
    match: exact("/v1/marketplace", "GET"),
    handle: () => ({ body: { items: DEPT_CATALOG, total: DEPT_CATALOG.length, _mock: true } }),
  },
  {
    match: rx(/^\/v1\/marketplace\/([^/]+)$/),
    handle: (_p, _m, _b, match) => {
      const m = match as RegExpMatchArray;
      const d = DEPT_CATALOG.find((x) => x.id === m[1]);
      if (!d) return { status: 404, body: { error: "dept not found" } };
      return { body: d };
    },
  },

  // ── builder / dev (For Builders Studio v0) ──
  {
    match: exact("/v1/dev/depts", "GET"),
    handle: () => ({ body: { items: BUILDER_DRAFTS.map(draftToCard), _mock: true } }),
  },
  {
    match: rx(/^\/v1\/dev\/depts\/([^/]+)$/),
    handle: (_p, _m, _b, match) => {
      const id = (match as RegExpMatchArray)[1];
      // Unknown id (incl. "new") starts a blank draft template.
      const draft = BUILDER_DRAFTS.find((d) => d.id === id) ?? { ...NEW_DRAFT, id };
      return { body: draft };
    },
  },
];

// ─── public API ──────────────────────────────────────────────────────────

export function isMockMode(): boolean {
  const v = import.meta.env.VITE_USE_MOCK;
  if (v === undefined) return false;
  return v === "true" || v === "1";
}

export async function mockHandle(
  path: string,
  method: Method,
  body?: unknown,
): Promise<MockResponse | undefined> {
  for (const h of HANDLERS) {
    const m = h.match(path, method);
    if (!m) continue;
    await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
    const res = h.handle(path, method, body, m as RegExpMatchArray | boolean);
    // eslint-disable-next-line no-console
    console.debug("[mock]", method, path, "→", res.status ?? 200);
    return res;
  }
  return undefined;
}
