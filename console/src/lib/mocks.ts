/**
 * Frontend mock-mode dispatcher.
 *
 * When `import.meta.env.VITE_USE_MOCK` is truthy, `lib/api.ts` consults
 * `mockHandle()` before making any real fetch. If a handler matches the
 * (path, method) tuple, its return value is used as the response — no
 * network call leaves the browser.
 *
 * Why this exists in production: the static site on mega-x.ai (Amplify) has
 * no FastAPI upstream behind /v1/*, so `.env.production` ships
 * VITE_USE_MOCK=true and this table is what keeps the Console demo alive.
 * When the backend (platform/ai_native/main.py) is deployed and /v1/* is
 * routed to it, flip VITE_USE_MOCK=false and rebuild — same call sites, no
 * refactor.
 *
 * Builders Studio (`/v1/dev/*`) and marketplace (`/v1/marketplace*`) are
 * intentionally NOT mocked: Studio chat needs the Recruiter WS (real draft
 * ids `dept-*`), and marketplace must merge `user_depts/published` so
 * third-party publishes show up. Those routes fall through to FastAPI.
 *
 * Matching note: paths are matched with the query string stripped —
 * call sites pass e.g. `/v1/companies?…` and handlers declare bare paths.
 * Mutations write to session-scoped stores so a created company/line/task
 * shows up in subsequent GETs until reload.
 */

import {
  COMPANIES, DEPT_CATALOG, AGENTS, TASKS, ARTIFACTS, ACTIVITY, ME,
  LINE_TEMPLATES, GROUP_LABELS,
  type Company, type Task, type Artifact,
} from "./fixtures";

/** Tasks created via makeTask in this tab — fixture rows are left alone. */
const SIMULATED_TASK_IDS = new Set<string>();

/** Demo-only: verb prefixes that mock chat treats as a task assignment. */
const MOCK_TASK_VERB_RE =
  /(?:帮我|请帮|麻烦|写一篇|写一?个|做一个|做一份|生成|整理|设计|起草|撰写|准备)/;

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

function makeCompany(b: Partial<Company>, audience: "business" | "solo"): Company {
  return {
    id: `${audience === "solo" ? "l" : "c"}-${Date.now().toString(36)}`,
    name: b.name ?? (audience === "solo" ? "新产线" : "新公司"),
    description: b.description,
    template_slug: b.template_slug ?? "mega-x-default",
    state: "running", // mock: skip the provisioning wait entirely
    gateway_port: 18800 + Math.floor(Math.random() * 100),
    dept_ids: b.dept_ids ?? ["dept-ceo", "dept-dev", "dept-pub"],
    token_usage_30d: 0,
    active_tasks: 0,
    created_at: new Date().toISOString(),
    emoji: b.emoji ?? (audience === "solo" ? "🚀" : "🏢"),
    last_activity_at: new Date().toISOString(),
    last_activity_text: "（演示数据）刚刚创建",
    ...(audience === "solo"
      ? { audience: "solo" as const, revenue_30d: 0, output_count_30d: 0, hours_saved_30d: 0, vs_last_month: 0 }
      : {}),
  };
}

// ─── session-scoped mutable stores ────────────────────────────────────────
// COMPANIES / TASKS are mutated in place so every handler sees creations.

/** Company templates for GET /v1/templates. Slugs must have i18n entries
 *  under `business.companies.new.tpl.<slug>.{name,desc}` (see zh/en/ar.json). */
const COMPANY_TEMPLATES = [
  { slug: "blank",              emoji: "📄", dept_ids: [] as string[] },
  { slug: "mega-x-default",     emoji: "🏢", dept_ids: DEPT_CATALOG.map((d) => d.id) },
  { slug: "game-studio",        emoji: "🎮", dept_ids: ["dept-ceo", "dept-game", "dept-dev", "dept-cinematic", "dept-pub", "dept-production"] },
  { slug: "mcn-content-machine", emoji: "🎬", dept_ids: ["dept-ceo", "dept-drama", "dept-cinematic", "dept-organic", "dept-ad", "dept-growth"] },
  { slug: "fintech-research",   emoji: "📈", dept_ids: ["dept-ceo", "dept-quant", "dept-research", "dept-panel", "dept-finance"] },
  { slug: "solo-assistant",     emoji: "🧑‍💻", dept_ids: ["dept-ceo", "dept-research", "dept-pub"] },
  { slug: "law-firm",           emoji: "⚖️", dept_ids: ["dept-ceo", "dept-legal", "dept-security", "dept-research"] },
].map((t) => ({
  ...t,
  name_key: `business.companies.new.tpl.${t.slug}.name`,
  desc_key: `business.companies.new.tpl.${t.slug}.desc`,
}));

// ─── dispatch table ──────────────────────────────────────────────────────

const HANDLERS: Handler[] = [
  // ── meta ──
  { match: exact("/health", "GET"), handle: () => ({ body: { status: "ok", _mock: true } }) },
  { match: exact("/v1/me", "GET"),  handle: () => ({ body: ME }) },
  {
    match: exact("/v1/auth/login", "POST"),
    handle: () => ({ body: { user: ME.user, _mock: true } }),
  },
  {
    match: exact("/v1/auth/register", "POST"),
    handle: () => ({ body: { user: ME.user, _mock: true } }),
  },
  {
    match: exact("/v1/auth/logout", "POST"),
    handle: () => ({ body: { ok: true, _mock: true } }),
  },
  {
    match: exact("/v1/templates", "GET"),
    handle: () => ({ body: { items: COMPANY_TEMPLATES, total: COMPANY_TEMPLATES.length, _mock: true } }),
  },
  {
    // Provision-progress polling. Mocked companies are born "running", so any
    // operation id a caller happens to hold is immediately done.
    match: rx(/^\/v1\/operations\/([^/]+)$/),
    handle: () => ({ body: { status: "done", _mock: true } }),
  },

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
    handle: () => {
      const items = COMPANIES.filter((c) => c.audience !== "solo");
      return { body: { items, total: items.length, _mock: true } };
    },
  },
  {
    match: exact("/v1/companies", "POST"),
    handle: (_p, _m, body) => {
      const newCo = makeCompany((body ?? {}) as Partial<Company>, "business");
      COMPANIES.push(newCo);
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
        Object.assign(co, body);
        return { body: co };
      }
      if (method === "DELETE") {
        COMPANIES.splice(COMPANIES.indexOf(co), 1);
        return { body: { deleted: true } };
      }
      return { status: 405, body: { error: "method not allowed" } };
    },
  },

  // ── company chat ──
  {
    match: rx(/^\/v1\/companies\/([^/]+)\/chat$/),
    handle: (_p, _m, body, match) => {
      const cid = (match as RegExpMatchArray)[1];
      const b = (body ?? {}) as { message?: string; dept_id?: string; session_id?: string };
      const dept = DEPT_CATALOG.find((d) => d.id === b.dept_id);
      const msg = (b.message ?? "").trim();
      const sessionId = b.session_id ?? `mock-sess-${cid}`;
      // Demo-only heuristic (NOT production logic — agent judges there).
      const isTask = MOCK_TASK_VERB_RE.test(msg);
      if (isTask) {
        const title = msg.split(/\r?\n/)[0]?.slice(0, 30) || msg.slice(0, 30) || "未命名任务";
        const task = makeTask(cid, {
          title,
          brief: msg,
          dept_id: b.dept_id ?? "dept-pub",
          source: "chat",
          chat_session_id: sessionId,
        });
        TASKS.push(task);
        return {
          body: {
            ok: true,
            reply:
              `【演示 · ${dept ? dept.name : "总控"}】已理解这是一项交付任务「${title}」。` +
              "我先立项确认目标与计划，具体产出会在任务会话中完成——可到「任务」页查看进度。",
            session_id: sessionId,
            task,
            _mock: true,
          },
        };
      }
      return {
        body: {
          ok: true,
          reply:
            `【演示回复 · ${dept ? dept.name : "总控"}】已收到：「${msg}」。` +
            "当前站点为纯前端演示（未接入后端），部署 FastAPI 后这里会由部门 Agent 真实作答。",
          session_id: sessionId,
          _mock: true,
        },
      };
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
    handle: (_p, method, _b, match) => {
      const m = match as RegExpMatchArray;
      const [, cid, did] = m;
      if (method === "DELETE") {
        const co = COMPANIES.find((c) => c.id === cid);
        if (co) co.dept_ids = co.dept_ids.filter((x) => x !== did);
        return { body: { deleted: true } };
      }
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
        const items = TASKS.filter((t) => t.company_id === cid);
        for (const task of items) advanceMockTask(task);
        return { body: { items, _mock: true } };
      }
      if (method === "POST") {
        const newTask = makeTask(cid, (body ?? {}) as Partial<Task>);
        TASKS.push(newTask);
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
      advanceMockTask(task);
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

  // ── marketplace + builder /dev ──
  // Unmocked — catalog merges roster ∪ user_depts/published (third-party).
  // A fixture-only /v1/marketplace would hide Studio-published depts.

  // ─── Solo lines（超级个体产线，复用 tenant_instance 后端，前端语义不同）──
  // GET /v1/lines  → 该用户的所有 solo 产线 (audience=solo 的 companies)
  {
    match: exact("/v1/lines", "GET"),
    handle: () => {
      const lines = COMPANIES.filter((c) => c.audience === "solo");
      return { body: { items: lines, total: lines.length, _mock: true } };
    },
  },
  // GET /v1/lines/templates  → 6 个收入产线模板
  {
    match: exact("/v1/lines/templates", "GET"),
    handle: () => ({ body: { items: LINE_TEMPLATES, total: LINE_TEMPLATES.length, _mock: true } }),
  },
  // POST /v1/lines  → 新建产线（等价于新建 audience=solo 的 company）
  {
    match: exact("/v1/lines", "POST"),
    handle: (_p, _m, body) => {
      const b = (body ?? {}) as Partial<Company>;
      const tpl = LINE_TEMPLATES.find((t) => t.slug === b.template_slug) ?? LINE_TEMPLATES[0];
      const newLine = makeCompany(
        { ...b, template_slug: tpl.slug, dept_ids: tpl.dept_ids, emoji: b.emoji ?? tpl.emoji },
        "solo",
      );
      COMPANIES.push(newLine);
      return { status: 201, body: newLine };
    },
  },
  // GET/DELETE /v1/lines/:id  → 单产线详情 / 删除产线
  {
    match: rx(/^\/v1\/lines\/([^/]+)$/),
    handle: (_p, method, _b, match) => {
      const id = (match as RegExpMatchArray)[1];
      const idx = COMPANIES.findIndex((c) => c.id === id && c.audience === "solo");
      if (idx < 0) return { status: 404, body: { error: "line not found" } };
      if (method === "DELETE") {
        COMPANIES.splice(idx, 1);
        return { body: { deleted: true } };
      }
      return { body: COMPANIES[idx] };
    },
  },
  // GET /v1/lines/:id/teammates  → 队友列表（按"组"分组 + 角色翻译）
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/teammates$/),
    handle: (_p, _m, _b, match) => {
      const id = (match as RegExpMatchArray)[1];
      const line = COMPANIES.find((c) => c.id === id && c.audience === "solo");
      if (!line) return { status: 404, body: { error: "line not found" } };

      const lineAgents = AGENTS.filter((a) => a.company_id === id);
      const groups = line.dept_ids.map((deptId) => {
        const dept = DEPT_CATALOG.find((d) => d.id === deptId);
        const labels = GROUP_LABELS[line.template_slug]?.[deptId];
        const deptAgents = lineAgents.filter((a) => a.dept_id === deptId);
        return {
          dept_id: deptId,
          group_emoji: labels?.emoji ?? dept?.emoji ?? "📋",
          label_key: labels?.label_key,                       // i18n key（前端 t() 翻译）
          fallback_label: dept?.name ?? deptId,
          teammates: deptAgents.map((a) => ({
            ...a,
            // 把人话叫法塞进 view model（前端 t() 翻译 title_key）
            title_key:
              a.team_role === "orchestrator" ? labels?.lead_title_key
            : a.team_role === "builder"      ? labels?.helper_title_key
            : a.team_role === "reviewer"     ? labels?.reviewer_title_key
            : labels?.ops_title_key,
            is_lead: a.team_role === "orchestrator",
          })),
        };
      });
      return { body: { groups, _mock: true } };
    },
  },
  // GET/POST /v1/lines/:id/depts — install teams on a solo line
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/depts$/),
    handle: (_p, method, body, match) => {
      const cid = (match as RegExpMatchArray)[1];
      const co = COMPANIES.find((c) => c.id === cid && c.audience === "solo");
      if (!co) return { status: 404, body: { error: "line not found" } };
      if (method === "POST") {
        const deptId = (body as { dept_id?: string } | undefined)?.dept_id;
        const dept = DEPT_CATALOG.find((d) => d.id === deptId);
        if (!deptId || !dept) return { status: 400, body: { error: "未知的部门 id" } };
        if (!co.dept_ids.includes(deptId)) co.dept_ids.push(deptId);
        return { status: 202, body: { dept_id: deptId, company_id: cid, dept_ids: co.dept_ids } };
      }
      return { body: { items: companyDeptItems(cid), _mock: true } };
    },
  },
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/depts\/([^/]+)\/agents$/),
    handle: (_p, _m, _b, match) => {
      const [, cid, did] = match as RegExpMatchArray;
      return { body: { items: AGENTS.filter((a) => a.company_id === cid && a.dept_id === did), _mock: true } };
    },
  },
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/depts\/([^/]+)$/),
    handle: (_p, method, _b, match) => {
      const [, cid, did] = match as RegExpMatchArray;
      const co = COMPANIES.find((c) => c.id === cid && c.audience === "solo");
      if (!co) return { status: 404, body: { error: "line not found" } };
      if (method === "DELETE") {
        co.dept_ids = co.dept_ids.filter((x) => x !== did);
        return { status: 202, body: { removed: did, dept_ids: co.dept_ids } };
      }
      return { status: 405, body: { error: "method not allowed" } };
    },
  },
  // POST /v1/lines/:id/chat — same auto-task heuristic as company chat
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/chat$/),
    handle: (_p, _m, body, match) => {
      const cid = (match as RegExpMatchArray)[1];
      const b = (body ?? {}) as { message?: string; dept_id?: string; session_id?: string };
      const dept = DEPT_CATALOG.find((d) => d.id === b.dept_id);
      const msg = (b.message ?? "").trim();
      const sessionId = b.session_id ?? `mock-sess-${cid}`;
      const isTask = MOCK_TASK_VERB_RE.test(msg);
      if (isTask) {
        const title = msg.split(/\r?\n/)[0]?.slice(0, 30) || msg.slice(0, 30) || "未命名任务";
        const task = makeTask(cid, {
          title,
          brief: msg,
          dept_id: b.dept_id ?? "dept-pub",
          source: "chat",
          chat_session_id: sessionId,
        });
        TASKS.push(task);
        return {
          body: {
            ok: true,
            reply:
              `【演示 · ${dept ? dept.name : "团队"}】已理解这是一项交付任务「${title}」。` +
              "我先立项确认目标与计划，具体产出会在任务会话中完成——可到「任务」页查看进度。",
            session_id: sessionId,
            task,
            _mock: true,
          },
        };
      }
      return {
        body: {
          ok: true,
          reply:
            `【演示回复 · ${dept ? dept.name : "团队"}】已收到：「${msg}」。` +
            "当前站点为纯前端演示（未接入后端），部署 FastAPI 后这里会由团队 Agent 真实作答。",
          session_id: sessionId,
          _mock: true,
        },
      };
    },
  },
  // GET/POST /v1/lines/:id/tasks  → 复用 task 数据
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/tasks$/),
    handle: (_p, method, body, match) => {
      const id = (match as RegExpMatchArray)[1];
      if (method === "POST") {
        const newTask = makeTask(id, (body ?? {}) as Partial<Task>);
        TASKS.push(newTask);
        return { status: 201, body: newTask };
      }
      return { body: { items: TASKS.filter((t) => t.company_id === id), _mock: true } };
    },
  },
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/tasks\/([^/]+)\/timeline$/),
    handle: (_p, _m, _b, match) => {
      const [, cid, tid] = match as RegExpMatchArray;
      return { body: { items: ACTIVITY.filter((a) => a.company_id === cid && a.task_id === tid), _mock: true } };
    },
  },
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/tasks\/([^/]+)$/),
    handle: (_p, _m, _b, match) => {
      const [, cid, tid] = match as RegExpMatchArray;
      const task = TASKS.find((t) => t.company_id === cid && t.id === tid);
      if (!task) return { status: 404, body: { error: "task not found" } };
      const artifacts = ARTIFACTS.filter((a) => task.artifact_ids.includes(a.id));
      return { body: { ...task, artifacts } };
    },
  },
  // GET /v1/lines/:id/artifacts  → 复用 artifact 数据
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/artifacts$/),
    handle: (_p, _m, _b, match) => {
      const id = (match as RegExpMatchArray)[1];
      return { body: { items: ARTIFACTS.filter((a) => a.company_id === id), _mock: true } };
    },
  },
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/artifacts\/([^/]+)$/),
    handle: (_p, _m, _b, match) => {
      const [, cid, aid] = match as RegExpMatchArray;
      const art = ARTIFACTS.find((a) => a.company_id === cid && a.id === aid);
      if (!art) return { status: 404, body: { error: "artifact not found" } };
      return { body: art };
    },
  },
  // GET /v1/lines/:id/activity
  {
    match: rx(/^\/v1\/lines\/([^/]+)\/activity$/),
    handle: (_p, _m, _b, match) => {
      const id = (match as RegExpMatchArray)[1];
      return { body: { items: ACTIVITY.filter((a) => a.company_id === id), _mock: true } };
    },
  },
  // GET /v1/leverage  → 跨产线杠杆 KPI 汇总
  {
    match: exact("/v1/leverage", "GET"),
    handle: () => {
      const lines = COMPANIES.filter((c) => c.audience === "solo" && c.state === "running");
      const totalAgents = lines.reduce(
        (sum, l) => sum + AGENTS.filter((a) => a.company_id === l.id).length,
        0,
      );
      const kpi = {
        output_count_30d: lines.reduce((s, l) => s + (l.output_count_30d ?? 0), 0),
        hours_saved_30d: lines.reduce((s, l) => s + (l.hours_saved_30d ?? 0), 0),
        revenue_30d: lines.reduce((s, l) => s + (l.revenue_30d ?? 0), 0),
        // 简单平均 vs_last_month，按各产线收入加权
        vs_last_month: 0.35,
        active_lines: lines.length,
        total_teammates: totalAgents,
      };
      return { body: kpi };
    },
  },
];

function makeTask(companyId: string, b: Partial<Task>): Task {
  // Mirror real backend: create immediately lands in_progress/0.1.
  const task: Task = {
    id: `t-${Date.now().toString(36)}`,
    company_id: companyId,
    dept_id: b.dept_id ?? "dept-pub",
    title: b.title ?? "未命名任务",
    brief: b.brief ?? "",
    state: "in_progress",
    progress: 0.1,
    created_at: new Date().toISOString(),
    deadline: b.deadline,
    expected_artifacts: b.expected_artifacts ?? ["markdown"],
    token_used: 0,
    cost_yuan: 0,
    artifact_ids: [],
    source: b.source ?? "console",
    chat_session_id: b.chat_session_id ?? null,
  };
  SIMULATED_TASK_IDS.add(task.id);
  return task;
}

/**
 * Advance a mock-created task toward done based on wall-clock age.
 * Stages (~10s): 0.1 → 0.25 → 0.6 → done/1.0 + one markdown artifact.
 * Fixture rows are never mutated.
 */
function advanceMockTask(task: Task): void {
  if (!SIMULATED_TASK_IDS.has(task.id)) return;
  if (task.state !== "pending" && task.state !== "in_progress") return;

  const ageMs = Date.now() - new Date(task.created_at).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return;

  if (ageMs >= 10_000) {
    task.state = "done";
    task.progress = 1;
    ensureMockArtifact(task);
  } else if (ageMs >= 6_000) {
    task.state = "in_progress";
    task.progress = 0.6;
  } else if (ageMs >= 3_000) {
    task.state = "in_progress";
    task.progress = 0.25;
  } else {
    task.state = "in_progress";
    task.progress = Math.max(task.progress, 0.1);
  }
}

function ensureMockArtifact(task: Task): void {
  if (task.artifact_ids.length > 0) return;
  const id = `art-mock-${task.id}`;
  if (!ARTIFACTS.some((a) => a.id === id)) {
    const art: Artifact = {
      id,
      task_id: task.id,
      company_id: task.company_id,
      dept_id: task.dept_id,
      name: `${task.title || "task"}.md`,
      type: "markdown",
      size_bytes: 256,
      created_at: new Date().toISOString(),
      preview_text: `# ${task.title}\n\n${task.brief || "(mock deliverable)"}`,
    };
    ARTIFACTS.push(art);
  }
  task.artifact_ids.push(id);
}

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
  // Call sites carry query strings (`?user_id=...`) the handlers don't care
  // about — match on the bare path.
  const bare = path.split("?")[0];
  for (const h of HANDLERS) {
    const m = h.match(bare, method);
    if (!m) continue;
    await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
    const res = h.handle(bare, method, body, m as RegExpMatchArray | boolean);
    // eslint-disable-next-line no-console
    console.debug("[mock]", method, path, "→", res.status ?? 200);
    return res;
  }
  return undefined;
}
