import test from "node:test";
import assert from "node:assert/strict";
import { researchPages, researchPageFromPath } from "../src/lib/research/navigation.ts";
test("each research menu has an independent reloadable route", () => {
  for (const page of ["tasks", "reports", "schools", "dialogue", "roundtable"]) {
    assert.equal(researchPageFromPath(page), page);
  }
});
test("existing research links and unknown sections retain the new research entry", () => {
  for (const path of [undefined, "", "new", "unknown", "tasks/unknown"]) {
    assert.equal(researchPageFromPath(path), "new");
  }
});

import { createCopy } from "../src/lib/research/copy.ts";
test("all research menu labels and page descriptions have English copy", () => {
  const tr = createCopy("en");
  for (const page of researchPages) {
    assert.notEqual(tr(page.label), page.label);
    assert.notEqual(tr(page.description), page.description);
  }
});
