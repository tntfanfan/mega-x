import { api } from "./api";

function commandKey(): string {
  // Public HTTP origins expose getRandomValues, but not randomUUID.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Preserve the receipt key when an accepted command's response is lost. */
async function taskCommand<T>(method: "post" | "put" | "patch" | "delete", url: string, body: Record<string, unknown>): Promise<T> {
  const storageKey = `task-command:${method}:${url}`;
  const serialized = JSON.stringify(body);
  let prior: { body: string; key: string } | null = null;
  try { prior = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { /* new request */ }
  const key = prior?.body === serialized ? prior.key : commandKey();
  localStorage.setItem(storageKey, JSON.stringify({ body: serialized, key }));
  const init = { headers: { "Idempotency-Key": key } };
  const result = method === "delete" ? await api.delete<T>(url, init) : await api[method]<T>(url, body, init);
  localStorage.removeItem(storageKey);
  return result;
}

export const postTaskCommand = <T = unknown>(url: string, body: Record<string, unknown>) => taskCommand<T>("post", url, body);
export const putTaskCommand = <T = unknown>(url: string, body: Record<string, unknown>) => taskCommand<T>("put", url, body);
export const patchTaskCommand = <T = unknown>(url: string, body: Record<string, unknown>) => taskCommand<T>("patch", url, body);
export const deleteTaskCommand = <T = unknown>(url: string) => taskCommand<T>("delete", url, {});
