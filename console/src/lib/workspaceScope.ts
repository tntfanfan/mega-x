/** Company, line, and sandbox share one chat / task / output UI. */

export type WorkspaceKind = "company" | "line" | "sandbox";

export type WorkspaceScope = {
  kind: WorkspaceKind;
  id: string;
  /** API prefix, no trailing slash. */
  base: string;
  /** Console route prefix. */
  routeBase: string;
};

export function companyScope(id: string): WorkspaceScope {
  return {
    kind: "company",
    id,
    base: `/v1/companies/${id}`,
    routeBase: `/business/c/${id}`,
  };
}

export function lineScope(id: string): WorkspaceScope {
  return {
    kind: "line",
    id,
    base: `/v1/lines/${id}`,
    routeBase: `/solo/l/${id}`,
  };
}

export function sandboxScope(draftId: string, official = false): WorkspaceScope {
  const base = official
    ? `/v1/dev/official/${draftId}/sandbox`
    : `/v1/dev/depts/${draftId}/sandbox`;
  return {
    kind: "sandbox",
    id: draftId,
    base,
    routeBase: official ? `/dev/official/${draftId}/studio` : `/dev/depts/${draftId}/studio`,
  };
}
