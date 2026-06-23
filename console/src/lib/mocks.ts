/**
 * Frontend mock-mode dispatcher.
 *
 * When `import.meta.env.VITE_USE_MOCK` is truthy, `lib/api.ts` consults
 * `mockHandle()` before making any real fetch. If a handler matches the
 * (path, method) tuple, its return value is used as the response — no
 * network call leaves the browser. This is how you can run the Console
 * UI without the FastAPI backend at all.
 *
 * Disable: set `VITE_USE_MOCK=false` in `.env.development` (or any env
 * file), then restart `pnpm dev`. The same code path makes real /v1/*
 * calls and goes through the mega-x dev_server reverse proxy.
 *
 * Add a new mock: append a row to MOCKS below. Keep the shape close to
 * what the real FastAPI router will eventually return so swapping is
 * a one-line config change, not a refactor.
 */

const SIMULATED_LATENCY_MS = 80; // feels like a real network without being annoying

type MockResponse = {
  status?: number; // default 200
  body: unknown;
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type MockHandler = (
  path: string,
  init: { method: Method; body?: unknown },
) => MockResponse | undefined;

// ─── fixtures ────────────────────────────────────────────────────────────

const ME = {
  user: {
    id: "user-dev-0001",
    email: "dev@mega-x.ai",
    display_name: "Dev User",
  },
  roles: ["tenant_owner", "developer"],
  tenants: [
    { id: "tenant-dev-0001", name: "Dev Tenant", role: "owner" },
  ],
  _mock: true,
};

// 21 官方部门，对齐 tools/ai_native/roster.json (mirror minimal subset
// so swapping to real backend doesn't break the UI).
const DEPTS = [
  { id: "dept-ad", name: "广告投放", source_type: "builtin", port: 18804, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 } },
  { id: "dept-ceo", name: "CEO / 总控", source_type: "builtin", port: 18800, role_count: 1, tier_breakdown: { HIGH: 1, MEDIUM: 0, LOW: 0 } },
  { id: "dept-cinematic", name: "影视化 CG", source_type: "builtin", port: 18820, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 } },
  { id: "dept-cpo", name: "产品策略 CPO", source_type: "builtin", port: 18818, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 0 } },
  { id: "dept-dev", name: "研发与代码评审", source_type: "builtin", port: 18801, role_count: 6, tier_breakdown: { HIGH: 1, MEDIUM: 4, LOW: 1 } },
  { id: "dept-drama", name: "剧本与短剧", source_type: "builtin", port: 18805, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 } },
  { id: "dept-finance", name: "财务", source_type: "builtin", port: 18813, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 } },
  { id: "dept-game", name: "像素沙盒游戏", source_type: "builtin", port: 18819, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 } },
  { id: "dept-growth", name: "增长与变现", source_type: "builtin", port: 18822, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 } },
  { id: "dept-hr", name: "招聘与组织管理", source_type: "builtin", port: 18808, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 } },
  { id: "dept-ir", name: "投资者关系", source_type: "builtin", port: 18815, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 0 } },
  { id: "dept-legal", name: "法务与合规", source_type: "builtin", port: 18811, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 0 } },
  { id: "dept-ops", name: "运维与可靠性", source_type: "builtin", port: 18802, role_count: 4, tier_breakdown: { HIGH: 0, MEDIUM: 2, LOW: 2 } },
  { id: "dept-organic", name: "有机账号运营", source_type: "builtin", port: 18823, role_count: 4, tier_breakdown: { HIGH: 0, MEDIUM: 3, LOW: 1 } },
  { id: "dept-panel", name: "专家面板", source_type: "builtin", port: 18821, role_count: 7, tier_breakdown: { HIGH: 7, MEDIUM: 0, LOW: 0 } },
  { id: "dept-production", name: "项目出品", source_type: "builtin", port: 18814, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 } },
  { id: "dept-pub", name: "官方渠道发行", source_type: "builtin", port: 18803, role_count: 5, tier_breakdown: { HIGH: 1, MEDIUM: 3, LOW: 1 } },
  { id: "dept-quant", name: "多策略量化", source_type: "builtin", port: 18824, role_count: 6, tier_breakdown: { HIGH: 2, MEDIUM: 3, LOW: 1 } },
  { id: "dept-research", name: "研究与情报", source_type: "builtin", port: 18812, role_count: 4, tier_breakdown: { HIGH: 1, MEDIUM: 2, LOW: 1 } },
  { id: "dept-security", name: "安全", source_type: "builtin", port: 18816, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 1, LOW: 1 } },
  { id: "dept-template", name: "HR 自检模板", source_type: "builtin", port: 18825, role_count: 3, tier_breakdown: { HIGH: 1, MEDIUM: 1, LOW: 1 } },
];

// ─── dispatch table ──────────────────────────────────────────────────────

const HANDLERS: { match: (p: string, m: Method) => boolean; handle: MockHandler }[] = [
  {
    match: (p, m) => m === "GET" && p === "/v1/me",
    handle: () => ({ body: ME }),
  },
  {
    match: (p, m) => m === "GET" && p === "/v1/depts",
    handle: () => ({ body: { items: DEPTS, total: DEPTS.length, _mock: true } }),
  },
  {
    match: (p, m) => m === "GET" && p === "/health",
    handle: () => ({ body: { status: "ok", service: "phyntom-x8-api", _mock: true } }),
  },
];

export function isMockMode(): boolean {
  const v = import.meta.env.VITE_USE_MOCK;
  if (v === undefined) return false;
  return v === "true" || v === "1" || v === true || v === 1;
}

export async function mockHandle(
  path: string,
  method: Method,
  body?: unknown,
): Promise<MockResponse | undefined> {
  for (const h of HANDLERS) {
    if (h.match(path, method)) {
      // small delay so loading states render at least one frame
      await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
      const res = h.handle(path, { method, body });
      if (res) {
        // log so devtools makes it obvious what's mocked
        // eslint-disable-next-line no-console
        console.debug("[mock]", method, path, "→", res.status ?? 200);
        return res;
      }
    }
  }
  return undefined;
}
