import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const locales = Object.fromEntries(["en", "zh"].map(locale => [locale, JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"))]));
const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/depts.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({ exports: {}, require: path => path === "./fixtures" ? { DEPT_CATALOG: [] } : { default: { t: key => key } } });
vm.runInContext(compiled, context);
const { resolveDeptDisplay, resolveDeptDesc } = context.exports;
const department = { id: "dept-investment", name: "股票投研部", short_desc: "个股研究、估值与风险报告", emoji: "🔎" };
const translator = locale => (key, options) => locales[locale][key] ?? options?.defaultValue ?? key;
test("company-only stock department cards localize name and description in English", () => {
  const t = translator("en");
  assert.equal(resolveDeptDisplay(department.id, [department], t).name, "Equity research department");
  assert.equal(resolveDeptDesc(department, t), "Stock research, valuation, and risk reports");
});
test("Chinese department copy and authored third-party titles remain unchanged", () => {
  const t = translator("zh");
  assert.equal(resolveDeptDisplay(department.id, [department], t).name, department.name);
  assert.equal(resolveDeptDesc(department, t), department.short_desc);
  const custom = { ...department, id: "dept-custom-stock", name: "我的投研部" };
  assert.equal(resolveDeptDisplay(custom.id, [custom], translator("en")).name, custom.name);
  assert.equal(resolveDeptDesc(custom, translator("en")), custom.short_desc);
});
