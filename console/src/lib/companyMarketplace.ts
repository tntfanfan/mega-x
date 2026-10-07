import type { DeptCatalogItem } from "./api";

type Transport = { get<T>(path: string): Promise<T> };
type CompanyDepartment = {
  department?: DeptCatalogItem | null;
  capabilities?: { discoverable?: boolean };
};

/** Company-only departments are discovered through their scoped endpoint. */
export async function loadCompanyMarketplace(api: Transport, companyId: string): Promise<DeptCatalogItem[]> {
  const [catalog, research] = await Promise.all([
    api.get<{ items: DeptCatalogItem[] }>("/v1/marketplace"),
    api.get<CompanyDepartment>(`/v1/companies/${encodeURIComponent(companyId)}/research/department`)
      .catch(() => null),
  ]);
  const items = catalog.items.filter(item => item.id !== "dept-investment");
  if (research?.capabilities?.discoverable && research.department?.id === "dept-investment") {
    items.push(research.department);
  }
  return items;
}
