import test from "node:test";
import assert from "node:assert/strict";
import { loadCompanyMarketplace } from "../src/lib/companyMarketplace.ts";
const base = { id: "dept-ceo", name: "CEO" };
const research = { id: "dept-investment", name: "股票投研部", source_type: "builtin" };
function transport(department, requests = []) {
  return { get: async path => {
    requests.push(path);
    return path === "/v1/marketplace" ? { items: [base] } : department;
  } };
}
test("eligible company's research department appears in its install catalog", async () => {
  const requests = [];
  const items = await loadCompanyMarketplace(transport({ department: research, capabilities: { discoverable: true } }, requests), "c/local");
  assert.deepEqual(items.map(d => d.id), [base.id, research.id]);
  assert(requests.includes("/v1/companies/c%2Flocal/research/department"));
});
test("a company without research access keeps only the ordinary marketplace", async () => {
  const items = await loadCompanyMarketplace(transport({ department: research, capabilities: { discoverable: false } }), "c-other");
  assert.deepEqual(items, [base]);
});
test("unavailable company research endpoint does not hide ordinary departments", async () => {
  const api = { get: async path => { if (path === "/v1/marketplace") return { items: [base] }; throw Error("unavailable"); } };
  assert.deepEqual(await loadCompanyMarketplace(api, "c-other"), [base]);
});
test("company card replaces a duplicate research card without duplicate entries", async () => {
  const api = { get: async path => path === "/v1/marketplace" ? { items: [base, { ...research, name: "old" }] } : { department: research, capabilities: { discoverable: true } } };
  const items = await loadCompanyMarketplace(api, "c-local");
  assert.deepEqual(items, [base, research]);
});
