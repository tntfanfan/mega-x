/**
 * Frontend mock-mode dispatcher.
 *
 * R1–R6: catalog + companies + lines + tasks + activity + chat hit real FastAPI.
 * Keep VITE_USE_MOCK=true so unmatched paths still fall through; only leave
 * handlers here for routes that remain stubbed (none for Console MVP).
 *
 * /v1/dev/* never had mocks (Recruiter).
 */

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

function exact(p: string, m: Method): HandlerMatch {
  return (path, method) => path === p && method === m;
}

/** Intentionally empty — all Console routes are live against FastAPI. */
const HANDLERS: Handler[] = [
  // Optional: keep health mock so UI works if API is down during pure layout work.
  // { match: exact("/health", "GET"), handle: () => ({ body: { status: "ok", _mock: true } }) },
];

void exact; // retain helper for future stubs
void HANDLERS;

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
