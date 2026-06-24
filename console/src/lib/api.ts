/**
 * Minimal fetch wrapper for the Phyntom X8 API.
 *
 * Same-origin everywhere (v2 path-mount architecture):
 * - DEV  — mega-x dev_server.py at :8000 reverse-proxies /v1/* → FastAPI :8001
 *          and serves the console SPA itself; browser only sees :8000.
 * - PROD — nginx at mega-x.ai routes /v1/* → FastAPI upstream and /console/*
 *          → static SPA build; browser only sees mega-x.ai.
 *
 * Mock mode: when VITE_USE_MOCK is truthy, `lib/mocks.ts` short-circuits
 * matched paths with fixture data so the Console UI can be developed and
 * reviewed without the FastAPI backend running. See `.env.development`.
 *
 * No CORS preflight, no cross-origin cookies, no subdomain hopping. We just
 * pass `credentials: "include"` so the host-only session cookie rides along.
 */

import { isMockMode, mockHandle } from "./mocks";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const MOCK = isMockMode();
if (MOCK) {
  // eslint-disable-next-line no-console
  console.warn("[api] MOCK MODE — see VITE_USE_MOCK in .env.development. " +
    "No real /v1/* requests will leave the browser.");
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = ((init.method ?? "GET") as string).toUpperCase() as
    "GET" | "POST" | "PATCH" | "DELETE";

  // Mock dispatch — when on, matched paths short-circuit fetch entirely.
  if (MOCK) {
    const reqBody = init.body == null ? undefined :
      (typeof init.body === "string" ? safeJsonParse(init.body) : init.body);
    const mocked = await mockHandle(path, method, reqBody);
    if (mocked !== undefined) {
      const status = mocked.status ?? 200;
      if (status < 200 || status >= 300) {
        throw new ApiError(status, mocked.body, `HTTP ${status} (mocked)`);
      }
      return mocked.body as T;
    }
    // No mock matched → fall through to real fetch so unmocked paths still
    // surface real errors instead of silently hanging.
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  const text = await res.text();
  let body: unknown = text;
  if (text && headers.get("Accept") !== "text/plain") {
    try {
      body = JSON.parse(text);
    } catch {
      // leave as text
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, body, `HTTP ${res.status} ${res.statusText}`);
  }
  return body as T;
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

/**
 * Best-effort human-readable message for a caught error, for use in toasts.
 * Prefers a server-supplied `{ error | detail | message }` field, then the
 * HTTP status line, then the raw message. Never throws.
 */
export function apiErrorMessage(e: unknown, fallback = "请求失败，请稍后重试"): string {
  if (e instanceof ApiError) {
    const b = e.body;
    if (b && typeof b === "object") {
      const obj = b as Record<string, unknown>;
      for (const k of ["error", "detail", "message"] as const) {
        if (typeof obj[k] === "string" && obj[k]) return obj[k] as string;
      }
    }
    if (typeof b === "string" && b) return b;
    return e.message || fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: Json) =>
    request<T>(path, { method: "POST", body: body == null ? undefined : JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body?: Json) =>
    request<T>(path, { method: "PATCH", body: body == null ? undefined : JSON.stringify(body) }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};

export type Me = {
  user: { id: string; email: string; display_name: string };
  roles: string[];
  tenants: { id: string; name: string; role: string }[];
};

export type DeptCard = {
  id: string;
  name: string;
  source_type: string;
  port?: number | null;
  role_count: number;
  tier_breakdown: { HIGH: number; MEDIUM: number; LOW: number };
};

// Re-export multi-company shapes from fixtures so consumers import from one
// place. When the real backend lands, these types may need slight tweaks but
// the API consumer call sites won't change.
export type {
  Company,
  CompanyState,
  DeptCatalogItem,
  Agent,
  AgentTeamRole,
  AgentTier,
  AgentStatus,
  Task,
  TaskState,
  Artifact,
  ArtifactType,
  ActivityEvent,
} from "./fixtures";
