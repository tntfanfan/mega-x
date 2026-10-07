import test from "node:test";
import assert from "node:assert/strict";
import {
  createCopy,
  researchLanguage,
  personaLabel,
  companyLabel,
} from "../src/lib/research/copy.ts";
test("authored literals translate while user text and company names remain intact", () => {
  const tr = createCopy("en");
  assert.equal(tr("投资圆桌"), "Investment roundtable");
  assert.equal(
    tr`报告对话 · ${"原报告"} · 固定版本 ${"r-1"}`,
    "Report discussion · 原报告 · Fixed version r-1",
  );
  assert.equal(
    personaLabel({ id: "buffett", name: "巴菲特" }, "en").name,
    "Warren Buffett",
  );
  assert.equal(companyLabel("美股", "en"), "US Stocks");
  assert.equal(companyLabel("Acme 美股策略", "en"), "Acme 美股策略");
  assert.equal(researchLanguage("ar"), "en");
  assert.equal(researchLanguage("zh-CN"), "zh");
});

import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
const han = /\p{Script=Han}/u;
function chineseLanguageBranch(node) {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (!ts.isConditionalExpression(parent)) continue;
    const condition = parent.condition.getText();
    if (child === parent.whenFalse && /language\s*===\s*["']en["']/.test(condition)) return true;
    if (child === parent.whenTrue && /language\s*===\s*["']zh["']/.test(condition)) return true;
  }
  return false;
}
test("research authored UI copy has no untranslated Chinese in English", () => {
  const tr = createCopy("en");
  const components = new URL("../src/components/research/", import.meta.url);
  const files = [
    ...readdirSync(components).filter(name => name.endsWith(".tsx")).map(name => new URL(name, components)),
    ...["pages/business/company/ResearchView.tsx", "hooks/useResearch.ts", "hooks/useResearchDialogue.ts", "lib/research/core.ts", "lib/research/dialogue.ts", "lib/research/navigation.ts"].map(name => new URL("../src/" + name, import.meta.url)),
  ];
  const missing = [];
  for (const file of files) {
    const source = ts.createSourceFile(file.pathname, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      const literal = ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
      if (literal && han.test(node.text) && !chineseLanguageBranch(node) && han.test(tr(node.text))) {
        missing.push(`${file.pathname.split("/src/")[1]}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.text} => ${tr(node.text)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});
test("school filters and waiting/partial failure statuses use complete English labels", () => {
  const tr = createCopy("en");
  assert.equal(tr("全部流派"), "All schools");
  assert.equal(tr("等待生成"), "Waiting for generation");
  assert.equal(tr("部分失败"), "Partially failed");
});
